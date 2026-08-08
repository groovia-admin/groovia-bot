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
    .select('id, order_id, pending_item_id, original_items_snapshot')
    .eq('shop_id', shopId)
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    logger.error({ error, shopId }, 'Failed to load staff edit session');
    return null;
  }

  return data;
}

// itemsSnapshot is the item list as it stood the moment editing started —
// kept for the whole session so "done" can diff against whatever's left
// and tell the customer what actually changed, not just the final state.
async function startEditSession(shopId, phone, orderId, itemsSnapshot) {
  const supabase = getSupabase();
  if (!supabase) return false;

  // Clear any stale session for this staff member first, same pattern as
  // sessionStore.js's createSession — avoids a leftover row blocking a
  // fresh edit if a previous one was never cleanly finished.
  await supabase.from('staff_order_edits').delete().eq('shop_id', shopId).eq('phone', phone);

  const { error } = await supabase
    .from('staff_order_edits')
    .insert({ shop_id: shopId, phone, order_id: orderId, original_items_snapshot: itemsSnapshot || [] });

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

// Set when a list tap or "edit N" asks "what's the new quantity" —
// cleared (itemId null) once that's answered or cancelled. The next
// text reply while this is set is interpreted as a quantity, not a
// generic edit command.
async function setPendingItem(shopId, phone, itemId) {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from('staff_order_edits').update({ pending_item_id: itemId }).eq('shop_id', shopId).eq('phone', phone);
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
    .select('id, product_name_snapshot, unit_snapshot, quantity, unit_price, subtotal')
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

// Shared by removeItems and adjustItemQuantity — both end with "reload
// whatever's left and recompute the order's subtotal/total_amount from
// it," and duplicating that a second time would risk the two drifting
// apart on rounding or fee handling.
async function recomputeOrderTotals(supabase, orderId) {
  const { data: remaining, error: remainingError } = await supabase
    .from('order_items')
    .select('subtotal')
    .eq('order_id', orderId);

  if (remainingError) {
    logger.error({ error: remainingError, orderId }, 'Failed to reload order items after edit');
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
    logger.error({ error: updateError, orderId }, 'Failed to update order totals after edit');
    return null;
  }

  return { subtotal: newSubtotal, total: newTotal, remainingCount: (remaining || []).length };
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

  const totals = await recomputeOrderTotals(supabase, orderId);
  if (!totals) return null;

  return { blocked: false, ...totals };
}

/**
 * Adjusts one item's quantity — the actual "deliver 1 of the 2 ordered"
 * case a plain remove/keep choice couldn't express. newQuantity <= 0 is
 * treated as removing the item entirely (delegates to removeItems' own
 * "can't empty the whole order" guard, so this can't be used to sneak
 * around that check). Otherwise updates quantity and recomputes that
 * line's subtotal from the item's own unit_price — never trusts a
 * client-supplied subtotal — then recomputes the order the same way
 * removeItems does.
 */
async function adjustItemQuantity(orderId, itemId, newQuantity) {
  const supabase = getSupabase();
  if (!supabase) return null;

  if (newQuantity <= 0) {
    return removeItems(orderId, [itemId]);
  }

  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .select('id, unit_price')
    .eq('id', itemId)
    .eq('order_id', orderId)
    .maybeSingle();

  if (itemError || !item) {
    logger.error({ error: itemError, orderId, itemId }, 'Failed to load item before quantity adjustment');
    return null;
  }

  const newSubtotalForItem = Number(item.unit_price) * newQuantity;

  const { error: updateItemError } = await supabase
    .from('order_items')
    .update({ quantity: newQuantity, subtotal: newSubtotalForItem })
    .eq('id', itemId);

  if (updateItemError) {
    logger.error({ error: updateItemError, orderId, itemId }, 'Failed to update item quantity');
    return null;
  }

  const totals = await recomputeOrderTotals(supabase, orderId);
  if (!totals) return null;

  return { blocked: false, ...totals };
}

/**
 * Compares the snapshot taken at edit-session start against the order's
 * current items and produces a customer-facing summary of what actually
 * changed. Returns { changed: false } if nothing did (e.g. staff opened
 * Edit, looked around, and just tapped Done) — callers should skip
 * sending anything in that case rather than notify about a no-op.
 */
function buildEditDiffSummary(originalItems, currentItems) {
  const lines = [];
  const currentById = new Map(currentItems.map((item) => [item.id, item]));

  for (const original of originalItems || []) {
    const current = currentById.get(original.id);

    if (!current) {
      lines.push(`❌ ${original.product_name_snapshot} — removed`);
    } else if (current.quantity !== original.quantity) {
      lines.push(`✏️ ${original.product_name_snapshot} — quantity ${original.quantity} → ${current.quantity}`);
    }
  }

  return { changed: lines.length > 0, lines };
}

module.exports = {
  getEditSession,
  startEditSession,
  endEditSession,
  setPendingItem,
  getOrderWithItems,
  formatItemList,
  removeItems,
  adjustItemQuantity,
  buildEditDiffSummary,
};
