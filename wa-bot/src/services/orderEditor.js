const crypto = require('crypto');
const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');

// Loads the order (scoped to shopId, so a caller can never touch another
// shop's order) plus its current line items. Used by sendEditPrompt
// (messageHandler.js) to check the order is still editable before
// issuing an edit link for it.
async function getOrderWithItems(orderId, shopId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, status, subtotal, total_amount, delivery_fee, tax_amount, discount_amount, shop_id')
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error || !order) return null;

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('id, product_name_snapshot, unit_snapshot, quantity, unit_price, subtotal')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (itemsError) return null;

  return { order, items: items || [] };
}

// Same hashed-random-token pattern as sessionService.js's customer
// webview sessions — only the hash is ever persisted, the raw token
// only ever exists in the link handed to staff and in-memory during a
// request. 24h flat expiry, no sliding window: unlike a browsing
// session this doesn't need to stay alive across a long visit, and the
// real access gate is orders.status = 'pending' anyway (re-checked on
// every mutation), which a still-valid token can't bypass once the
// order's been actioned some other way.
const EDIT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a fresh edit link token for one order. Returns the raw token
 * (put it in the WhatsApp link) or null if it couldn't be created — a
 * fresh one is always minted on each "Edit" tap rather than reusing a
 * prior link, so there's no need to track/rotate a "current" one per
 * order; an old link past its TTL just stops working on its own.
 */
async function createEditLink(orderId, shopId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EDIT_LINK_TTL_MS).toISOString();

  const { error } = await supabase
    .from('order_edit_links')
    .insert({ order_id: orderId, shop_id: shopId, token_hash: tokenHash, expires_at: expiresAt });

  if (error) {
    logger.error({ error, orderId, shopId }, 'Failed to create order edit link');
    return null;
  }

  return token;
}

module.exports = {
  getOrderWithItems,
  createEditLink,
};
