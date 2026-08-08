const logger = require('../utils/logger');

// ── Supabase client (lazy init, shared with messageHandler) ────
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn(
      {
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
        hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      },
      'Supabase not configured — missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    );
    return null;
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  } catch (err) {
    logger.warn({ err }, 'Supabase client initialization failed');
  }
  return _supabase;
}

const INDIA_PHONE_REGEX = /^[6-9]\d{9}$/;

/**
 * Normalizes a WhatsApp `from` value (bare digits, e.g. "919876543210")
 * into the same +91XXXXXXXXXX shape stored in shop_users.phone_number.
 */
function normalizeWhatsappFrom(from) {
  let digits = String(from || '').replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  if (!INDIA_PHONE_REGEX.test(digits)) {
    return null;
  }

  return `+91${digits}`;
}

/**
 * Resolves which shop owns the WhatsApp Business number that received the
 * message, via the whatsapp_connections table. Returns the shop itself
 * (id/name/slug — what starting a v2 webview session needs), not just
 * its id, so the fallback path in messageHandler.js can hand a customer
 * straight to the ordering webview without a second lookup. Returns
 * null if this phone_number_id isn't linked to any active shop.
 */
async function resolveShopByPhoneNumberId(phoneNumberId) {
  const supabase = getSupabase();
  if (!supabase || !phoneNumberId) return null;

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('shops ( id, name, slug, is_active )')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    logger.error({ error, phoneNumberId }, 'whatsapp_connections lookup failed');
    return null;
  }

  if (!data) return null;

  const shop = Array.isArray(data.shops) ? data.shops[0] : data.shops;
  if (!shop || !shop.is_active) return null;

  return shop;
}

/**
 * Resolves the sender's shop_users row (id/role/name), scoped to the
 * given shop. Returns null if the phone isn't a recognized active staff
 * member of that specific shop — this is the authorization check that
 * closes the "any phone can control any shop's orders" hole.
 */
async function resolveShopUserByPhone(shopId, from) {
  const supabase = getSupabase();
  if (!supabase || !shopId) return null;

  const normalized = normalizeWhatsappFrom(from);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('shop_users')
    .select('id, role, full_name')
    .eq('shop_id', shopId)
    .eq('phone_number', normalized)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error({ error, shopId }, 'shop_users lookup failed');
    return null;
  }

  if (!data) return null;

  return { id: data.id, role: data.role, fullName: data.full_name };
}

/**
 * Same check as resolveShopUserByPhone, but NOT scoped to a shop known
 * in advance — needed now that one shared WhatsApp number serves
 * multiple shops, so there's no longer a single phone_number_id ->
 * shop_id mapping to derive a shopId from before checking staff
 * status. Must run before any customer-path/session logic: staff
 * identity always takes priority, regardless of whether that same
 * phone happens to have an unrelated active ordering session open at
 * some other shop.
 *
 * Assumes a phone is staff for at most one shop — if the same number
 * is ever added as staff at two shops, this returns whichever the
 * query happens to return first, not a defined choice between them.
 */
async function resolveShopUserGlobal(from) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const normalized = normalizeWhatsappFrom(from);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('shop_users')
    .select('id, shop_id, role, full_name, whatsapp_welcomed_at')
    .eq('phone_number', normalized)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ error, from: normalized }, 'Global shop_users lookup failed');
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    shopId: data.shop_id,
    role: data.role,
    fullName: data.full_name,
    whatsappWelcomedAt: data.whatsapp_welcomed_at,
  };
}

/**
 * Active staff phone numbers for a shop — shared by every *proactive*
 * staff-facing broadcast (new-order alerts, reminders, dashboard-status-
 * change visibility, the first-contact welcome message) instead of each
 * one running its own copy of the same query.
 *
 * Deliberately excludes role='owner': the owner runs the shop from the
 * dashboard and gets WhatsApp for exactly one thing today — the
 * Supabase phone-auth login OTP, sent through its own separate hook,
 * nothing to do with this bot's messaging at all. Every proactive push
 * built on top of this function would otherwise also land in the
 * owner's chat, including (absurdly) telling them about an action they
 * just took themselves from the dashboard. This does NOT affect the
 * owner's ability to act reactively — resolveShopUserGlobal still
 * resolves them as staff if they choose to text a command themselves;
 * this only controls what gets pushed at them unprompted.
 */
async function getActiveStaffPhones(shopId) {
  const supabase = getSupabase();
  if (!supabase || !shopId) return [];

  const { data, error } = await supabase
    .from('shop_users')
    .select('phone_number')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .neq('role', 'owner')
    .not('phone_number', 'is', null);

  if (error) {
    logger.error({ error, shopId }, 'Failed to load active staff phones');
    return [];
  }

  return (data || []).map((s) => s.phone_number);
}

/**
 * Resolves a shop from the slug carried in a "SHOP-{slug}" QR message.
 * Only matches active shops — a disabled/suspended shop's QR should
 * fail the same way a nonexistent slug does, not leak that the shop
 * exists but is inactive.
 */
async function findShopBySlug(slug) {
  const supabase = getSupabase();
  if (!supabase || !slug) return null;

  const { data, error } = await supabase
    .from('shops')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error({ error, slug }, 'Shop slug lookup failed');
    return null;
  }

  return data;
}

/**
 * Nearby active shops by straight-line distance, using the PostGIS
 * geography column (see the accompanying SQL) rather than plain
 * lat/long math — lets Postgres use the GIST index instead of scanning
 * every shop and computing Haversine distance in application code.
 */
async function findNearbyShops(latitude, longitude, { radiusKm = 10, limit = 5 } = {}) {
  const supabase = getSupabase();
  if (!supabase || latitude == null || longitude == null) return [];

  const { data, error } = await supabase.rpc('nearby_shops', {
    in_latitude: latitude,
    in_longitude: longitude,
    in_radius_km: radiusKm,
    in_limit: limit,
  });

  if (error) {
    logger.error({ error, latitude, longitude }, 'Nearby shops lookup failed');
    return [];
  }

  return data || [];
}

module.exports = {
  getSupabase,
  normalizeWhatsappFrom,
  resolveShopByPhoneNumberId,
  resolveShopUserByPhone,
  resolveShopUserGlobal,
  getActiveStaffPhones,
  findShopBySlug,
  findNearbyShops,
};
