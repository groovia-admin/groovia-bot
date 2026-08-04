const crypto = require('crypto');
const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');
const { sendButtonMessage } = require('./whatsappClient');

function generateOrderNumber() {
  return `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Resolves a WhatsApp native-cart submission's product_items (Meta
 * retailer_id + quantity + Meta's own item_price) into real cart lines,
 * trusting our own products table for current name/unit/price rather
 * than whatever price Meta's catalog had cached — the catalog sync is
 * on-demand, not real-time, so it can drift.
 *
 * retailer_id was set to products.id when the catalog was synced, so no
 * separate mapping table is needed — it maps straight back.
 */
async function buildCartFromOrderMessage(shopId, productItems) {
  const supabase = getSupabase();
  if (!supabase) return { items: [], skipped: [] };

  const ids = productItems.map((p) => p.product_retailer_id).filter(Boolean);

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, unit, price, is_available, stock_quantity')
    .eq('shop_id', shopId)
    .in('id', ids);

  if (error) {
    logger.error({ error, shopId }, 'Failed to load products for cart');
    return { items: [], skipped: productItems };
  }

  const byId = new Map((products || []).map((p) => [p.id, p]));
  const items = [];
  const skipped = [];

  for (const item of productItems) {
    const product = byId.get(item.product_retailer_id);
    const quantity = Number(item.quantity) || 0;

    if (!product || !product.is_available || quantity <= 0 || quantity > product.stock_quantity) {
      skipped.push(item);
      continue;
    }

    items.push({
      product_id: product.id,
      name: product.name,
      unit: product.unit,
      unit_price: product.price,
      quantity,
      subtotal: product.price * quantity,
    });
  }

  return { items, skipped };
}

function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.subtotal, 0);
}

/**
 * Creates the order from a completed session (cart + slot + payment
 * chosen). Upserts the customer by (shop_id, phone), inserts the order,
 * its line items, and the customer detail snapshot in one pass.
 */
async function createOrderFromSession(shopId, phone, session) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: existingCustomer, error: customerLookupError } = await supabase
    .from('customers')
    .select('id')
    .eq('shop_id', shopId)
    .eq('phone', phone)
    .maybeSingle();

  if (customerLookupError) {
    logger.error({ error: customerLookupError, shopId, phone }, 'Customer lookup failed');
    return null;
  }

  let customerId = existingCustomer?.id ?? null;

  if (customerId) {
    const customerUpdate = { last_order_at: new Date().toISOString() };
    if (session.customer_name) customerUpdate.full_name = session.customer_name;

    await supabase.from('customers').update(customerUpdate).eq('id', customerId);
  } else {
    const { data: createdCustomer, error: createCustomerError } = await supabase
      .from('customers')
      .insert({
        shop_id: shopId,
        phone,
        full_name: session.customer_name || null,
        last_order_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createCustomerError) {
      logger.error({ error: createCustomerError, shopId, phone }, 'Failed to create customer');
      return null;
    }

    customerId = createdCustomer.id;
  }

  const orderNumber = generateOrderNumber();
  const totalAmount = session.cart_total;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      shop_id: shopId,
      customer_id: customerId,
      status: 'pending',
      order_type: 'pickup',
      payment_method: session.payment_method,
      payment_status: 'pending',
      subtotal: totalAmount,
      delivery_fee: 0,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: totalAmount,
      pickup_slot_label: session.pickup_slot_label,
      created_via: 'whatsapp',
    })
    .select('id, order_number')
    .single();

  if (orderError) {
    logger.error({ error: orderError, shopId, phone }, 'Failed to create order');
    return null;
  }

  const orderItems = session.cart_items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_name_snapshot: item.name,
    unit_snapshot: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
  }));

  // Neither insert depends on the other (both only need order.id, already
  // in hand) — running them in parallel instead of sequentially shaves a
  // full round trip off order placement.
  const [{ error: itemsError }, { error: detailsError }] = await Promise.all([
    supabase.from('order_items').insert(orderItems),
    supabase.from('order_customer_details').insert({
      order_id: order.id,
      customer_id: customerId,
      customer_name_snapshot: session.customer_name || null,
      customer_phone_snapshot: phone,
    }),
  ]);

  if (itemsError) {
    logger.error({ error: itemsError, orderId: order.id }, 'Failed to insert order items');
  }

  if (detailsError) {
    logger.error({ error: detailsError, orderId: order.id }, 'Failed to insert order customer details');
  }

  return order;
}

/**
 * Texts every active shop_users member (owner/manager/staff alike, same
 * "any active staff member can act" model already used for order status
 * commands) that a new order came in. No shop-side push for new orders
 * existed before this — staff previously had no way to know an order
 * arrived except checking some other way.
 *
 * Sent as a tappable Accept/Reject button message rather than plain text
 * asking staff to type "ACCEPT ORD-XXXX" — typing an exact order number
 * on a phone keyboard is slow and error-prone. The button id carries the
 * order's own id, so there's nothing to type or get wrong; whoever taps
 * first wins (handleOrderCommand's status check rejects a second tap).
 */
async function notifyShopOfNewOrder(shopId, order, session) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: staff, error } = await supabase
    .from('shop_users')
    .select('phone_number')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .not('phone_number', 'is', null);

  if (error) {
    logger.error({ error, shopId }, 'Failed to load shop staff for new-order notify');
    return;
  }

  const itemLines = session.cart_items
    .map((item) => `${item.name} × ${item.quantity} — ₹${item.subtotal.toFixed(2)}`)
    .join('\n');

  const message =
    `🆕 *New order ${order.order_number}* — ₹${session.cart_total.toFixed(2)}\n\n` +
    `👤 ${session.customer_name || 'Customer'}\n` +
    `⏰ Pickup: ${session.pickup_slot_label}\n` +
    `💵 Payment: ${session.payment_method}\n\n` +
    `Items:\n${itemLines}`;

  const buttons = [
    { id: `accept_${order.id}`, title: '✅ Accept' },
    { id: `reject_${order.id}`, title: '❌ Reject' },
    { id: `edit_${order.id}`, title: '✏️ Edit' },
  ];

  await Promise.all(
    (staff || []).map((s) => sendButtonMessage(s.phone_number, message, buttons))
  );
}

module.exports = {
  buildCartFromOrderMessage,
  cartTotal,
  createOrderFromSession,
  notifyShopOfNewOrder,
};
