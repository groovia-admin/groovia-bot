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
 * message, via the whatsapp_connections table. Returns the shop_id, or
 * null if this phone_number_id isn't linked to any shop.
 */
async function resolveShopByPhoneNumberId(phoneNumberId) {
  const supabase = getSupabase();
  if (!supabase || !phoneNumberId) return null;

  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('shop_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    logger.error({ error, phoneNumberId }, 'whatsapp_connections lookup failed');
    return null;
  }

  return data?.shop_id ?? null;
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

module.exports = {
  getSupabase,
  normalizeWhatsappFrom,
  resolveShopByPhoneNumberId,
  resolveShopUserByPhone,
};
