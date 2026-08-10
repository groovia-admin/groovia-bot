const { getSupabase } = require('./shopResolver');

// Loads the order (scoped to shopId, so a caller can never touch another
// shop's order) plus its current line items. Used by sendEditPrompt
// (messageHandler.js) to check the order is still editable before
// handing off to the dashboard's own item editor.
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

module.exports = {
  getOrderWithItems,
};
