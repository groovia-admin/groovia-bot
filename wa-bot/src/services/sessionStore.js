const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');

/**
 * Short-lived post-cart conversation state (pickup slot -> payment method
 * -> confirm). Item selection itself is handled by WhatsApp's native
 * Catalog+Cart, so this only ever tracks what happens after a cart arrives
 * — one row per active (shop, phone) conversation.
 */

async function getSession(shopId, phone) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('whatsapp_order_sessions')
    .select('*')
    .eq('shop_id', shopId)
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    logger.error({ error, shopId, phone }, 'Failed to load order session');
    return null;
  }

  return data;
}

async function createSession(shopId, phone, { cartItems, cartTotal, customerName }) {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Replace any stale session for this (shop, phone) — a new cart
  // submission always starts a fresh conversation.
  await supabase
    .from('whatsapp_order_sessions')
    .delete()
    .eq('shop_id', shopId)
    .eq('phone', phone);

  const { data, error } = await supabase
    .from('whatsapp_order_sessions')
    .insert({
      shop_id: shopId,
      phone,
      step: 'awaiting_slot',
      cart_items: cartItems,
      cart_total: cartTotal,
      customer_name: customerName || null,
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, shopId, phone }, 'Failed to create order session');
    return null;
  }

  return data;
}

async function updateSession(id, changes) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('whatsapp_order_sessions')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logger.error({ error, id }, 'Failed to update order session');
    return null;
  }

  return data;
}

async function deleteSession(id) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase.from('whatsapp_order_sessions').delete().eq('id', id);

  if (error) {
    logger.error({ error, id }, 'Failed to delete order session');
  }
}

module.exports = { getSession, createSession, updateSession, deleteSession };
