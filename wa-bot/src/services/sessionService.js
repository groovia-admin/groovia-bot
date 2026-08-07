const crypto = require('crypto');
const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');

// Phase 1 of the v2 architecture: the session spine everything else
// (shop routing, the ordering webview, order submission) is built on.
// A customer messages the bot, gets handed a link with a token, opens
// it in the webview — the webview never talks to WhatsApp or knows the
// shop's Meta identity, it just trusts a session this service issued.

// 30 min, sliding — every successful validateSession() call extends the
// window, so an actively-browsing customer is never logged out
// mid-checkout, while an abandoned tab still expires 30 min after the
// LAST activity, not the first.
const SESSION_TTL_MS = 30 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Only the hash is ever stored — same reasoning as a password hash.
// Anyone with read access to order_sessions (a DB admin, a leaked
// service-role key, a future bug in an unrelated query) still can't
// mint a valid session from what's stored; the raw token only ever
// exists in the link handed to the customer and in-memory during a
// request.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a new session for a customer at a shop. Returns the raw token
 * (put it in the webview link) and the session id, or null if it
 * couldn't be created. The token itself is never persisted — only its
 * hash is.
 */
async function createSession(shopId, customerPhone, { cartSnapshot } = {}) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from('order_sessions')
    .insert({
      token_hash: tokenHash,
      shop_id: shopId,
      customer_phone: customerPhone,
      status: 'active',
      cart_snapshot: cartSnapshot || null,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error) {
    logger.error({ error, shopId, customerPhone }, 'Failed to create order session');
    return null;
  }

  return { token, sessionId: data.id };
}

/**
 * Validates a token from the webview: must exist, be 'active', and not
 * be past its expiry. Returns the session (shop_id, customer_phone,
 * cart_snapshot) or null if invalid/expired/consumed — the webview
 * treats null the same way regardless of which of those it actually
 * was, so as not to leak which case it hit.
 *
 * Non-destructive except for the sliding-expiry bump — safe to call on
 * every page load / API request during a session, unlike consumeSession
 * below.
 */
async function validateSession(token) {
  const supabase = getSupabase();
  if (!supabase || !token) return null;

  const tokenHash = hashToken(token);

  const { data: session, error } = await supabase
    .from('order_sessions')
    .select('id, shop_id, customer_phone, status, cart_snapshot, expires_at')
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    logger.error({ error }, 'Failed to validate order session');
    return null;
  }

  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    // Flip it to 'expired' explicitly rather than leaving a stale
    // 'active' row around — a later query filtering only on status
    // would otherwise mistake it for still valid.
    await supabase
      .from('order_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', session.id);
    return null;
  }

  const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const { error: slideError } = await supabase
    .from('order_sessions')
    .update({ expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq('id', session.id);

  if (slideError) {
    logger.error({ error: slideError, sessionId: session.id }, 'Failed to slide session expiry');
    // Still a valid session for this request even if the slide-update
    // failed — worst case it expires 30min from the *original* check
    // instead of this one, not a security issue either way.
  }

  return { ...session, expires_at: newExpiresAt };
}

/**
 * Finalizes a session — called once, at order submission. Flips status
 * to 'consumed' so the same token can never be replayed to submit a
 * second order. Checks status='active' AND not-yet-expired in the same
 * atomic update (not a separate read-then-write), so a session that
 * expired between the customer's last page load and their submit can't
 * sneak through just because nothing had called validateSession to
 * flip it to 'expired' yet.
 *
 * Returns the session (for the caller to actually build the order
 * from) or null if it wasn't a live active session — caller must treat
 * that as "reject the submission", not silently proceed.
 */
async function consumeSession(token) {
  const supabase = getSupabase();
  if (!supabase || !token) return null;

  const tokenHash = hashToken(token);

  const { data: session, error } = await supabase
    .from('order_sessions')
    .update({ status: 'consumed', updated_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .select('id, shop_id, customer_phone, cart_snapshot')
    .maybeSingle();

  if (error) {
    logger.error({ error }, 'Failed to consume order session');
    return null;
  }

  return session;
}

/**
 * Persists cart state as the customer browses (Phase 5's webview calls
 * this on every add/remove) — separate from validateSession so a plain
 * page-load doesn't require also passing a cart payload.
 */
async function updateCartSnapshot(token, cartSnapshot) {
  const supabase = getSupabase();
  if (!supabase || !token) return false;

  const tokenHash = hashToken(token);
  const { error } = await supabase
    .from('order_sessions')
    .update({ cart_snapshot: cartSnapshot, updated_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .eq('status', 'active');

  if (error) {
    logger.error({ error }, 'Failed to update session cart snapshot');
    return false;
  }

  return true;
}

module.exports = {
  createSession,
  validateSession,
  consumeSession,
  updateCartSnapshot,
};
