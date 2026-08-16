const crypto = require('crypto');
const logger = require('../utils/logger');
const { getSupabase, normalizeWhatsappFrom, getActiveStaffPhones } = require('./shopResolver');
const { sendButtonMessageDetailed, sendWhatsAppTemplateDetailed, sendButtonMessage, sendWhatsAppMessage } = require('./whatsappClient');
const { logMessage } = require('./conversationLogger');
const deliveryTracker = require('./deliveryTracker');

// Registered once new_order_alert is created + approved in Meta as a
// plain Utility text template with 7 numbered body variables (order
// number, total, customer name, pickup slot, payment method, customer
// note, items — note added after the customer-instructions field was
// wired up; still unset most of the time, {{6}} should read "None" or
// similar in that case since a template variable can't be blank) and
// 3 quick-reply buttons (Accept/Reject/Edit, static labels — the
// dynamic order id travels in each button's payload override instead).
// Templates bypass the 24h customer-service window entirely, which is
// the whole point: this is the fallback for exactly the failure mode
// the plain interactive alert below can't survive.
const NEW_ORDER_ALERT_TEMPLATE = { name: 'new_order_alert', language: 'en_US' };

// Staff aren't alerted the instant an order is placed — the customer
// gets a 5-minute self-cancel window first (see handleCustomerMessage's
// cancel_order_ handling in messageHandler.js), specifically to avoid
// the accept-then-immediately-need-to-un-accept cycle when a customer
// cancels right after ordering. processDueNewOrderAlerts (below) is
// what actually fires the alert once this has elapsed; this constant
// must stay in sync with the cancel window's own limit, since the
// design only works if staff never see an order before the customer
// can no longer cancel it.
const NEW_ORDER_ALERT_DELAY_MS = 5 * 60 * 1000;

function generateOrderNumber() {
  return `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// Shared by every place stock needs adjusting on an order lifecycle
// event. Moved here (from messageHandler.js) so reminderService.js's
// auto-reject can call it too, without messageHandler.js and
// reminderService.js needing to require each other.
//
// Stock is reserved at PLACEMENT now, not at accept (see
// createOrderFromSession/the webview's order-creation route) — closing
// a real overselling race where two customers could both pass the
// availability check on the last unit before either order was ever
// triaged by a human. Accept is now a no-op for stock (already
// reserved); reject and cancel both restore it, whichever point in the
// lifecycle they happen from. Best-effort throughout: a stock-
// adjustment failure must never undo or block the status change
// itself, which has already succeeded by the time any caller reaches
// this.
async function adjustStockForOrder(supabase, order, shopId, { sign, movementType, verb, createdBy = null }) {
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('product_id, product_name_snapshot, quantity')
    .eq('order_id', order.id);

  if (itemsError) {
    logger.error({ error: itemsError, orderId: order.id }, `Failed to load order items for stock ${verb}`);
    return;
  }

  for (const item of items || []) {
    if (!item.product_id) continue; // custom/removed products have no stock to adjust

    const delta = sign * item.quantity;
    const { error: rpcError } = await supabase.rpc('adjust_product_stock', {
      p_product_id: item.product_id,
      p_delta: delta,
    });

    if (rpcError) {
      logger.error({ error: rpcError, orderId: order.id, productId: item.product_id }, `Failed to ${verb} stock for product`);
      continue;
    }

    const { error: movementError } = await supabase.from('inventory_movements').insert({
      shop_id: shopId,
      product_id: item.product_id,
      quantity_delta: delta,
      movement_type: movementType,
      reference_id: order.id,
      notes: `Order #${order.order_number} — ${item.product_name_snapshot}`,
      created_by: createdBy,
    });

    if (movementError) {
      logger.error({ error: movementError, orderId: order.id, productId: item.product_id }, 'Failed to record inventory movement');
    }
  }
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
 * The "order placed" message + cancel button — shared so the copy can't
 * drift between the native-catalog flow (messageHandler.js's confirm_yes
 * handler, which already has the order/phone in hand and sends this
 * directly) and the webview's order-submission endpoint, which creates
 * the order straight in Supabase from the dashboard and has to reach
 * back into wa-bot over the internal API (see sendOrderPlacedConfirmation
 * below) to get the same WhatsApp message sent.
 */
function buildOrderPlacedPayload(orderNumber, orderId) {
  const body =
    `✅ *Order ${orderNumber} placed!*\n\n` +
    `You can cancel within 5 minutes if needed.\n\n` +
    `Waiting for the shop to confirm — we'll message you.`;

  return { body, buttons: [{ id: `cancel_order_${orderId}`, title: '❌ Cancel order' }] };
}

/**
 * Called from wa-bot/src/routes/internal.js — an order created by the
 * webview (dashboard) has no WhatsApp conversation in progress to reply
 * into, so the confirmation has to be sent this way instead of inline
 * after creation like the native-catalog flow does.
 */
async function sendOrderPlacedConfirmation(orderId, shopId) {
  const supabase = getSupabase();
  if (!supabase) return { success: false };

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, shop_id, order_customer_details ( customer_phone_snapshot )')
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error || !order) {
    logger.error({ error, orderId, shopId }, 'Failed to load order for placement confirmation');
    return { success: false };
  }

  const details = Array.isArray(order.order_customer_details)
    ? order.order_customer_details[0]
    : order.order_customer_details;
  const phone = details?.customer_phone_snapshot;

  if (!phone) {
    logger.warn({ orderId, shopId }, 'No customer phone snapshot — cannot send placement confirmation');
    return { success: false };
  }

  const { body, buttons } = buildOrderPlacedPayload(order.order_number, order.id);
  const sent = await sendButtonMessage(phone, body, buttons);

  if (sent) {
    logMessage(shopId, phone, 'outbound', 'system', 'interactive', body);
  }

  return { success: sent };
}

/**
 * Builds the Accept/Reject/Edit alert body + buttons for one order.
 * Sent as tappable buttons rather than plain text asking staff to type
 * "ACCEPT ORD-XXXX" — typing an exact order number on a phone keyboard
 * is slow and error-prone. The button id carries the order's own id,
 * so there's nothing to type or get wrong; whoever taps first wins
 * (handleOrderCommand's status check rejects a second tap).
 *
 * Shared by notifyStaffForOrder (both the delayed live path and the
 * resend catch-up, both DB-reconstructed — no in-memory session exists
 * by the time either runs) — one body/button shape either way.
 */
function buildNewOrderAlertPayload(order, { customerName, total, pickupSlot, paymentMethod, itemsText, notes }) {
  // A customer note (ring the bell, less spicy, call before delivering)
  // used to be captured nowhere at all — reported as a real gap, since
  // it's exactly the kind of thing that has to reach staff BEFORE they
  // accept, not buried somewhere they'd only see after. Shown right
  // under payment, above the item list, so it can't be missed scrolling
  // past a long order.
  const notesLine = notes ? `📝 Note: ${notes}\n\n` : '';
  const body =
    `🆕 *New order ${order.order_number}* — ₹${Number(total).toFixed(2)}\n\n` +
    `👤 ${customerName || 'Customer'}\n` +
    `⏰ Pickup: ${pickupSlot}\n` +
    `💵 Payment: ${paymentMethod}\n\n` +
    notesLine +
    `Items:\n${itemsText}`;

  const buttons = [
    { id: `accept_${order.id}`, title: '✅ Accept' },
    { id: `reject_${order.id}`, title: '❌ Reject' },
    { id: `edit_${order.id}`, title: '✏️ Edit' },
  ];

  // Everything the template fallback / retry loop would need to
  // reconstruct this exact notification later, without another DB round
  // trip — stored once here rather than re-derived at retry time.
  return {
    orderNumber: order.order_number,
    total,
    customerName: customerName || 'Customer',
    pickupSlot,
    paymentMethod,
    itemsText,
    notes: notes || null,
    body,
    buttons,
  };
}

/**
 * Sends the new-order alert to every active staff member for one order
 * row — the DB is always the source of truth for this (order_items /
 * order_customer_details), never an in-memory session, since by the
 * time this fires (whether from the 5-minute delay below or the manual
 * resend catch-up) any WhatsApp conversation session for the customer
 * has long since been deleted.
 */
async function notifyStaffForOrder(order) {
  const supabase = getSupabase();
  if (!supabase) return;

  const phones = await getActiveStaffPhones(order.shop_id);

  const details = Array.isArray(order.order_customer_details)
    ? order.order_customer_details[0]
    : order.order_customer_details;

  const itemsText = (order.order_items || [])
    .map((item) => `${item.product_name_snapshot} × ${item.quantity} — ₹${Number(item.subtotal).toFixed(2)}`)
    .join('\n');

  const payload = buildNewOrderAlertPayload(order, {
    customerName: details?.customer_name_snapshot,
    total: order.total_amount,
    pickupSlot: order.pickup_slot_label,
    paymentMethod: order.payment_method,
    itemsText,
    notes: order.notes,
  });

  await Promise.all(
    phones.map((phone) => sendTrackedNewOrderAlert(order.id, phone, payload))
  );
}

const STATUS_STAFF_LABEL = {
  accepted: { emoji: '✅', verb: 'accepted' },
  rejected: { emoji: '❌', verb: 'rejected' },
  ready: { emoji: '📦', verb: 'marked ready' },
  completed: { emoji: '✅', verb: 'marked completed' },
  cancelled: { emoji: '🚫', verb: 'cancelled' },
};

// Same tap-to-advance affordance handleOrderCommand already offers
// after a WhatsApp-driven transition (see messageHandler.js's own
// NEXT_STEP_BUTTON) — without this, a status change that happened
// through the dashboard (or, now, an item edit) left staff with a
// plain confirmation and no obvious next action beyond typing a raw
// command. Same button ids (`ready_<id>`/`complete_<id>`), so
// handleStaffButtonReply's existing generic regex match routes a tap on
// either straight into the normal command flow with no changes needed
// there.
const NEXT_STEP_STAFF_BUTTON = {
  accepted: (orderId) => ({ id: `ready_${orderId}`, title: '📦 Mark ready' }),
  ready: (orderId) => ({ id: `complete_${orderId}`, title: '✅ Mark complete' }),
};

/**
 * Proactive visibility for staff still watching WhatsApp when someone
 * actions an order through the dashboard (or an item edit) instead.
 * Without this, the original new-order-alert message (with live
 * Accept/Reject/Edit buttons — WhatsApp never grays these out) just
 * sits there unchanged; another staff member has no way to know the
 * order was already handled until they tap one of those buttons
 * themselves and get handleOrderCommand's "someone may have already
 * updated it" bounce. That reactive guard was already correct, this
 * adds the proactive half.
 *
 * `via` names what actually triggered this for the confirmation text —
 * defaults to "the dashboard" (the original caller, the order-status
 * PATCH route); an item edit passes its own phrasing instead, since
 * "via the dashboard" would be actively wrong when the edit came from
 * the no-login WhatsApp-linked edit page rather than a dashboard login.
 *
 * Deliberately notifies every active staff phone, including whoever
 * actually took the action — there's no reliable way to map a dashboard
 * login (or a signed edit link) back to one specific WhatsApp number,
 * and re-informing your own action is a much smaller cost than leaving
 * a teammate out of the loop.
 */
async function notifyStaffOfDashboardStatusChange(orderId, shopId, status, actorName, reason, via = 'the dashboard') {
  const supabase = getSupabase();
  if (!supabase) return;

  const label = STATUS_STAFF_LABEL[status];
  if (!label) return; // no staff-relevant copy for this status — nothing to say

  const { data: order, error } = await supabase
    .from('orders')
    .select('order_number')
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error || !order) {
    logger.error({ error, orderId, shopId }, 'Failed to load order for dashboard-status-change staff notify');
    return;
  }

  const byLine = actorName ? ` via ${via} by ${actorName}` : ` via ${via}`;
  const reasonLine = reason ? `\nReason: ${reason}` : '';
  const text = `${label.emoji} Order *${order.order_number}* was ${label.verb}${byLine}.${reasonLine}`;

  const phones = await getActiveStaffPhones(shopId);
  const nextStepButton = NEXT_STEP_STAFF_BUTTON[status]?.(orderId);

  if (nextStepButton) {
    await Promise.all(phones.map((phone) => sendButtonMessage(phone, text, [nextStepButton])));
  } else {
    await Promise.all(phones.map((phone) => sendWhatsAppMessage(phone, text)));
  }
}

const NEW_ORDER_SELECT =
  `id, order_number, shop_id, status, total_amount, pickup_slot_label, payment_method, notes,
   order_items ( product_name_snapshot, quantity, subtotal ),
   order_customer_details ( customer_name_snapshot )`;

/**
 * The actual delay mechanism for the 5-minute customer self-cancel
 * window (see NEW_ORDER_ALERT_DELAY_MS above) — called from a periodic
 * scan (index.js), NOT a per-order setTimeout. An in-memory timer would
 * silently vanish on a Railway restart/redeploy mid-window, leaving
 * that order's staff alert never sent at all; a DB-backed "has this
 * been sent yet" check survives that fine, just picks up on the next
 * poll.
 *
 * Only touches orders still 'pending' past the delay whose alert hasn't
 * gone out yet (shop_alert_sent_at IS NULL) — an order the customer
 * cancelled within the window is already 'cancelled' by the time this
 * runs and is correctly skipped by the query itself.
 */
async function processDueNewOrderAlerts() {
  const supabase = getSupabase();
  if (!supabase) return;

  const cutoff = new Date(Date.now() - NEW_ORDER_ALERT_DELAY_MS).toISOString();

  const { data: orders, error } = await supabase
    .from('orders')
    .select(NEW_ORDER_SELECT)
    .eq('status', 'pending')
    .is('shop_alert_sent_at', null)
    .lte('created_at', cutoff);

  if (error) {
    logger.error({ error }, 'Failed to load orders due for their delayed new-order alert');
    return;
  }

  for (const order of orders || []) {
    // Claim atomically FIRST, then send — not the other way around.
    // Sending before marking left a real race: two overlapping ticks
    // (a slow-running previous invocation still in flight when the next
    // 60s timer fires, or more than one wa-bot replica polling the same
    // table) could both pass the "not yet sent" check above and both
    // call notifyStaffForOrder before either got here to mark it,
    // sending the same alert twice — confirmed in production via two
    // notification_deliveries rows for the same order 585ms apart, both
    // delivered. The old comment here ("avoid a double-send if two poll
    // ticks ever overlap") was wrong: this update only ever prevented a
    // double-*mark*, not a double-*send*, since the send already
    // happened above it unconditionally. Only whichever tick's atomic
    // update actually matches a row (still null at the moment it runs)
    // may proceed to notify.
    const { data: claimed, error: markError } = await supabase
      .from('orders')
      .update({ shop_alert_sent_at: new Date().toISOString() })
      .eq('id', order.id)
      .is('shop_alert_sent_at', null)
      .select('id')
      .maybeSingle();

    if (markError) {
      logger.error({ error: markError, orderId: order.id }, 'Failed to mark shop_alert_sent_at');
      continue;
    }

    if (!claimed) continue; // another tick already claimed and sent this order's alert

    await notifyStaffForOrder(order);
  }
}

/**
 * One-time (or repeatable) catch-up for orders whose alert simply never
 * got sent for some other reason (e.g. a bug, or orders that predate
 * this delayed-alert system). Re-sends the alert (through the same
 * tracked path, so failures from here forward ARE covered) to every
 * currently-pending order for a shop, regardless of shop_alert_sent_at.
 *
 * Safe to call more than once: only orders still in 'pending' are
 * touched, so anything already accepted/rejected/cancelled in the
 * meantime is skipped automatically by the query itself.
 */
async function resendPendingOrderAlerts(shopId) {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  const { data: orders, error } = await supabase
    .from('orders')
    .select(NEW_ORDER_SELECT)
    .eq('shop_id', shopId)
    .eq('status', 'pending');

  if (error) {
    logger.error({ error, shopId }, 'Failed to load pending orders for resend');
    return { success: false, error: 'Failed to load pending orders' };
  }

  if (!orders || orders.length === 0) {
    return { success: true, ordersResent: 0 };
  }

  for (const order of orders) {
    await notifyStaffForOrder(order);
  }

  return { success: true, ordersResent: orders.length };
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
  const { orderNumber, total, customerName, pickupSlot, paymentMethod, itemsText, notes } = delivery.payload;

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: String(orderNumber) },
        { type: 'text', text: Number(total).toFixed(2) },
        { type: 'text', text: String(customerName) },
        { type: 'text', text: String(pickupSlot) },
        { type: 'text', text: String(paymentMethod) },
        { type: 'text', text: notes ? String(notes) : 'None' },
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

// How long a customer can cancel their own order without staff
// involvement — must match NEW_ORDER_ALERT_DELAY_MS above; the whole
// point of delaying the staff alert is that it lands right as this
// window closes, so staff never see an order the customer was still
// free to cancel.
const CUSTOMER_CANCEL_WINDOW_MS = NEW_ORDER_ALERT_DELAY_MS;

/**
 * Customer-initiated cancel, called from the "❌ Cancel order" button
 * sent alongside the placement confirmation. Every failure mode is
 * distinguished so the caller can reply with something specific rather
 * than a generic error:
 *   - not_found: no such order (shouldn't happen from a real button tap)
 *   - wrong_customer: the order belongs to a different phone — never
 *     confirms or denies existence to the mismatched phone, just treat
 *     as not_found from the caller's perspective
 *   - already_processed: status isn't 'pending' anymore (staff already
 *     acted some other way, e.g. via the dashboard directly)
 *   - window_expired: still 'pending', but past the 5-minute mark
 *   - ok: cancelled successfully
 *
 * The status update itself is guarded by .eq('status', 'pending') as
 * part of the same query — not a separate read-then-write — so a
 * cancel racing the delayed alert job (which only reads 'pending'
 * orders) can't land after the order was already accepted through some
 * other path in between this function's own read and write.
 */
async function cancelOrderByCustomer(orderId, phone) {
  const supabase = getSupabase();
  if (!supabase) return { result: 'db_unavailable' };

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, shop_id, status, created_at, order_customer_details ( customer_phone_snapshot )')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    logger.error({ error, orderId }, 'Failed to load order for customer cancel');
    return { result: 'db_unavailable' };
  }

  if (!order) return { result: 'not_found' };

  const details = Array.isArray(order.order_customer_details)
    ? order.order_customer_details[0]
    : order.order_customer_details;

  // Both sides normalized before comparing — customer_phone_snapshot is
  // written as the raw bare-digit webhook `from` value (confirmed
  // against real rows: "919998494699", no "+"), while `phone` here goes
  // through normalizeWhatsappFrom first, which returns "+91XXXXXXXXXX".
  // Comparing the normalized value against the raw snapshot directly (as
  // this used to) meant the two literally could never match — every
  // customer cancel attempt fell through to "not_found" regardless of
  // whether it was actually their order or how much time had passed,
  // masking the already-correct window_expired/already_processed
  // handling entirely.
  const normalizedPhone = normalizeWhatsappFrom(phone);
  const normalizedSnapshot = normalizeWhatsappFrom(details?.customer_phone_snapshot);
  if (!normalizedSnapshot || normalizedSnapshot !== normalizedPhone) {
    return { result: 'not_found' };
  }

  if (order.status !== 'pending') {
    return { result: 'already_processed', order };
  }

  const ageMs = Date.now() - new Date(order.created_at).getTime();
  if (ageMs > CUSTOMER_CANCEL_WINDOW_MS) {
    return { result: 'window_expired', order };
  }

  const { data: updated, error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      cancellation_reason: 'Cancelled by customer',
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('status', 'pending')
    .select('id, order_number, shop_id')
    .maybeSingle();

  if (updateError) {
    logger.error({ error: updateError, orderId }, 'Failed to cancel order');
    return { result: 'db_unavailable' };
  }

  // The atomic .eq('status', 'pending') matched nothing — someone else
  // (e.g. the delayed alert firing right as staff acted through the
  // dashboard) changed it between the read above and this write.
  if (!updated) return { result: 'already_processed', order };

  return { result: 'ok', order: updated };
}

module.exports = {
  buildCartFromOrderMessage,
  cartTotal,
  createOrderFromSession,
  buildOrderPlacedPayload,
  sendOrderPlacedConfirmation,
  notifyStaffForOrder,
  notifyStaffOfDashboardStatusChange,
  processDueNewOrderAlerts,
  cancelOrderByCustomer,
  retryNewOrderAlert,
  sendNewOrderAlertTemplateFallback,
  resendPendingOrderAlerts,
  adjustStockForOrder,
};
