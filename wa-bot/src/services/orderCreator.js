const crypto = require('crypto');
const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');
const { sendButtonMessageDetailed, sendWhatsAppTemplateDetailed } = require('./whatsappClient');
const deliveryTracker = require('./deliveryTracker');

// Registered once new_order_alert is created + approved in Meta as a
// plain Utility text template with 6 numbered body variables (order
// number, total, customer name, pickup slot, payment method, items) and
// 3 quick-reply buttons (Accept/Reject/Edit, static labels — the
// dynamic order id travels in each button's payload override instead).
// Templates bypass the 24h customer-service window entirely, which is
// the whole point: this is the fallback for exactly the failure mode
// the plain interactive alert below can't survive.
const NEW_ORDER_ALERT_TEMPLATE = { name: 'new_order_alert', language: 'en_US' };

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

  const itemsText = session.cart_items
    .map((item) => `${item.name} × ${item.quantity} — ₹${item.subtotal.toFixed(2)}`)
    .join('\n');

  const body =
    `🆕 *New order ${order.order_number}* — ₹${session.cart_total.toFixed(2)}\n\n` +
    `👤 ${session.customer_name || 'Customer'}\n` +
    `⏰ Pickup: ${session.pickup_slot_label}\n` +
    `💵 Payment: ${session.payment_method}\n\n` +
    `Items:\n${itemsText}`;

  const buttons = [
    { id: `accept_${order.id}`, title: '✅ Accept' },
    { id: `reject_${order.id}`, title: '❌ Reject' },
    { id: `edit_${order.id}`, title: '✏️ Edit' },
  ];

  // Everything the template fallback / retry loop would need to
  // reconstruct this exact notification later, without another DB round
  // trip — stored once here rather than re-derived at retry time.
  const payload = {
    orderNumber: order.order_number,
    total: session.cart_total,
    customerName: session.customer_name || 'Customer',
    pickupSlot: session.pickup_slot_label,
    paymentMethod: session.payment_method,
    itemsText,
    body,
    buttons,
  };

  await Promise.all(
    (staff || []).map((s) => sendTrackedNewOrderAlert(order.id, s.phone_number, payload))
  );
}

/**
 * Sends the interactive Accept/Reject/Edit alert and records a
 * notification_deliveries row for it. The send itself succeeding here
 * only means Meta's API accepted the request — the 24h-window failure
 * mode this whole tracking system exists for shows up later, as a
 * "failed" status webhook against the message id recorded below, not as
 * a synchronous error here (confirmed against real production logs:
 * "sent" immediately, "failed" ~1s later via webhook). See
 * handleStatusUpdate in messageHandler.js for where that's handled.
 */
async function sendTrackedNewOrderAlert(orderId, phone, payload) {
  const deliveryId = await deliveryTracker.recordDelivery({
    orderId,
    recipientPhone: phone,
    purpose: 'new_order_alert',
    payload,
  });

  const result = await sendButtonMessageDetailed(phone, payload.body, payload.buttons);

  if (result.success) {
    await deliveryTracker.markSent(deliveryId, result.messageId);
    return;
  }

  // The API itself rejected the request outright (not the delayed
  // window-expired case) — e.g. malformed request, rate limited. Real
  // retry candidate.
  await deliveryTracker.recordFailure(deliveryId, result.error, 0);
}

/**
 * Re-attempts the plain interactive alert for a delivery the retry loop
 * picked up (genuinely transient failure, not window-expired — those go
 * straight to the template fallback below instead, see
 * handleStatusUpdate). Skips sending anything if the order has already
 * moved past 'pending' — no point alerting about an order someone
 * already accepted/rejected through a faster path.
 */
async function retryNewOrderAlert(delivery) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', delivery.order_id)
    .maybeSingle();

  if (order && order.status !== 'pending') {
    await supabase
      .from('notification_deliveries')
      .update({ status: 'skipped_order_resolved', updated_at: new Date().toISOString() })
      .eq('id', delivery.id);
    return;
  }

  const result = await sendButtonMessageDetailed(delivery.recipient_phone, delivery.payload.body, delivery.payload.buttons);

  if (result.success) {
    await deliveryTracker.markSent(delivery.id, result.messageId);
    return;
  }

  await deliveryTracker.recordFailure(delivery.id, result.error, delivery.attempt_count);
}

/**
 * The actual fix for the 24h-window failure: an approved template
 * (bypasses the window entirely) with the same Accept/Reject/Edit
 * choice, sent as quick-reply buttons with the order id in each
 * button's payload override rather than its (static) label. Called
 * immediately from handleStatusUpdate on detecting code 131047 — no
 * point waiting for the retry loop on a failure mode retrying can't fix.
 *
 * Returns false (and leaves the delivery in 'needs_template') if this
 * also fails — almost certainly because new_order_alert hasn't been
 * created/approved in Meta yet, not a bug in this code.
 */
async function sendNewOrderAlertTemplateFallback(delivery) {
  const { orderNumber, total, customerName, pickupSlot, paymentMethod, itemsText } = delivery.payload;

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: String(orderNumber) },
        { type: 'text', text: Number(total).toFixed(2) },
        { type: 'text', text: String(customerName) },
        { type: 'text', text: String(pickupSlot) },
        { type: 'text', text: String(paymentMethod) },
        { type: 'text', text: String(itemsText) },
      ],
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [{ type: 'payload', payload: `accept_${delivery.order_id}` }],
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '1',
      parameters: [{ type: 'payload', payload: `reject_${delivery.order_id}` }],
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '2',
      parameters: [{ type: 'payload', payload: `edit_${delivery.order_id}` }],
    },
  ];

  const result = await sendWhatsAppTemplateDetailed(
    delivery.recipient_phone,
    NEW_ORDER_ALERT_TEMPLATE.name,
    NEW_ORDER_ALERT_TEMPLATE.language,
    components
  );

  if (result.success) {
    await deliveryTracker.markSent(delivery.id, result.messageId);
    return true;
  }

  logger.warn(
    { deliveryId: delivery.id, error: result.error },
    'new_order_alert template fallback also failed — likely not approved in Meta yet'
  );
  return false;
}

module.exports = {
  buildCartFromOrderMessage,
  cartTotal,
  createOrderFromSession,
  notifyShopOfNewOrder,
  retryNewOrderAlert,
  sendNewOrderAlertTemplateFallback,
};
