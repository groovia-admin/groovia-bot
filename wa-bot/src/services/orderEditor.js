const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');

// Tracks which staff member (by phone, per shop) is mid-edit on which
// order — a real table rather than an in-memory Map for the same reason
// sessionStore.js uses one for the customer cart flow: this needs to
// survive across requests/replicas, not just the current process.
async function getEditSession(shopId, phone) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('staff_order_edits')
    .select('id, order_id')
    .eq('shop_id', shopId)
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    logger.error({ error, shopId }, 'Failed to load staff edit session');
    return null;
  }

  return data;
}

async function startEditSession(shopId, phone, orderId) {
  const supabase = getSupabase();
  if (!supabase) return false;

  // Clear any stale session for this staff member first, same pattern as
  // sessionStore.js's createSession — avoids a leftover row blocking a
  // fresh edit if a previous one was never cleanly finished.
  await supabase.from('staff_order_edits').delete().eq('shop_id', shopId).eq('phone', phone);

  const { error } = await supabase
    .from('staff_order_edits')
    .insert({ shop_id: shopId, phone, order_id: orderId });

  if (error) {
    logger.error({ error, shopId, orderId }, 'Failed to start staff edit session');
    return false;
  }

  return true;
}

async function endEditSession(shopId, phone) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('staff_order_edits').delete().eq('shop_id', shopId).eq('phone', phone);
}

// Loads the order (scoped to shopId, so an edit session can never touch
// another shop's order) plus its current line items, oldest first — the
// same order the numbered list was built from, so item numbers stay
// consistent between messages.
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
    .select('id, product_name_snapshot, quantity, unit_price, subtotal')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (itemsError) return null;

  return { order, items: items || [] };
}

function formatItemList(items) {
  return items
    .map((item, i) => `${i + 1}. ${item.product_name_snapshot} × ${item.quantity} — ₹${Number(item.subtotal).toFixed(2)}`)
    .join('\n');
}

/**
 * Deletes the given order_items rows and recomputes the order's
 * subtotal/total_amount from whatever's left. Returns null if that would
 * remove every item — callers should block that rather than leave a
 * zero-item order sitting there (a fully empty order should be Rejected
 * instead, not Accepted).
 */
async function removeItems(orderId, itemIdsToRemove) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: currentItems, error: currentError } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId);

  if (currentError) {
    logger.error({ error: currentError, orderId }, 'Failed to load current order items before removal');
    return null;
  }

  const remainingCount = (currentItems || []).length - itemIdsToRemove.length;
  if (remainingCount <= 0) return { blocked: true };

  const { error: deleteError } = await supabase.from('order_items').delete().in('id', itemIdsToRemove);
  if (deleteError) {
    logger.error({ error: deleteError, orderId }, 'Failed to remove order items');
    return null;
  }

  const { data: remaining, error: remainingError } = await supabase
    .from('order_items')
    .select('subtotal')
    .eq('order_id', orderId);

  if (remainingError) {
    logger.error({ error: remainingError, orderId }, 'Failed to reload order items after removal');
    return null;
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('delivery_fee, tax_amount, discount_amount')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    logger.error({ error: orderError, orderId }, 'Failed to load order fees before recomputing total');
    return null;
  }

  const newSubtotal = (remaining || []).reduce((sum, item) => sum + Number(item.subtotal), 0);
  const newTotal =
    newSubtotal + Number(order.delivery_fee || 0) + Number(order.tax_amount || 0) - Number(order.discount_amount || 0);

  const { error: updateError } = await supabase
    .from('orders')
    .update({ subtotal: newSubtotal, total_amount: newTotal })
    .eq('id', orderId);

  if (updateError) {
    logger.error({ error: updateError, orderId }, 'Failed to update order totals after item removal');
    return null;
  }

  return { blocked: false, subtotal: newSubtotal, total: newTotal, remainingCount: (remaining || []).length };
}

module.exports = {
  getEditSession,
  startEditSession,
  endEditSession,
  getOrderWithItems,
  formatItemList,
  removeItems,
};
