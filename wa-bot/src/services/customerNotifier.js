const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');
const { getTemplate, fmtMoney } = require('./templates');
const { sendWhatsAppTemplate, sendWhatsAppMessage, uploadWhatsAppMedia, sendWhatsAppDocument } = require('./whatsappClient');
const { logMessage } = require('./conversationLogger');
const { generateInvoicePdfBuffer } = require('./invoiceGenerator');

// Meta's template UI often defaults to "English (US)" (en_US) rather
// than the neutral "English" (en) templates.js declares — picking the
// wrong one at creation time fails outright (#132001, "template name
// does not exist in <language>") rather than falling back. Trying both,
// in order, means that one locale mismatch doesn't silently block every
// customer notification. This does NOT help if the template genuinely
// doesn't exist/isn't approved under either code — that still has to be
// fixed in WhatsApp Manager.
const LANGUAGE_FALLBACKS = ['en', 'en_US'];

async function sendTemplateWithFallback(phone, template, components) {
  // Always try the template's own configured language first — that's
  // the one actually confirmed against WhatsApp Manager, not a guess.
  // Previously, if template.language happened to already be a member of
  // LANGUAGE_FALLBACKS, the whole fallback list was used in its fixed
  // order instead — meaning a template correctly configured as en_US
  // still wasted a doomed-to-fail attempt against `en` first (confirmed
  // in production: order_ready, configured en_US, failed under en
  // before failing again under en_US — a param-count mismatch, not a
  // language one, but the wasted en attempt was real and confusing).
  const languages = [template.language, ...LANGUAGE_FALLBACKS.filter((l) => l !== template.language)];

  for (const language of languages) {
    const sent = await sendWhatsAppTemplate(phone, template.name, language, components);
    if (sent) return true;
  }

  return false;
}

/**
 * Plain-text itemized receipt — sent alongside order_confirm on ACCEPT,
 * per the v2 build brief's own Phase 7 flow (ACCEPT -> order_confirm +
 * receipt). Deliberately plain text, not a generated PDF/image: nothing
 * else in this codebase produces documents, and a formatted text list is
 * exactly what every other WhatsApp-commerce bot sends as a "receipt" in
 * practice — adding a PDF pipeline (generation + either a new public
 * storage bucket or WhatsApp's Media Upload API) is real infrastructure
 * for a nice-to-have, not core to placing/confirming an order.
 *
 * Best-effort and NOT retried, unlike the new-order-alert path: this is
 * a plain free-form message, so it inherits the same 24h customer-
 * service-window limit as any other non-template send (Meta error
 * 131047) if a shop sits on a pending order for a very long time before
 * accepting. Building the same tracked-retry/template-fallback machinery
 * deliveryTracker.js already has, just for this, would be a lot of
 * infrastructure for a supplementary message the customer's order_confirm
 * template already covers the essential half of (their order was
 * accepted) — logged and dropped on failure instead.
 */
function buildReceiptText(order, shopName) {
  const currencyCode = order.currency_code;
  const items = order.order_items || [];
  const itemLines = items
    .map(
      (item) =>
        `${item.product_name_snapshot} × ${item.quantity} (${item.unit_snapshot}) — ${fmtMoney(item.subtotal, currencyCode)}`
    )
    .join('\n');

  const deliveryLine =
    order.order_type === 'delivery' && order.delivery_fee
      ? `Delivery fee: ${fmtMoney(order.delivery_fee, currencyCode)}\n`
      : '';

  const deliveryAddressLine =
    order.order_type === 'delivery' && order.delivery_address_snapshot?.address_line_1
      ? `Delivering to: ${order.delivery_address_snapshot.address_line_1}\n`
      : '';

  return (
    `🧾 *Receipt — Order ${order.order_number}*\n\n` +
    `${itemLines}\n\n` +
    deliveryLine +
    `*Total: ${fmtMoney(order.total_amount, currencyCode)}*\n` +
    (order.pickup_slot_label ? `Pickup: ${order.pickup_slot_label}\n` : '') +
    deliveryAddressLine +
    `\nThank you for ordering from *${shopName}*! 🙏`
  );
}

/**
 * Sends the WhatsApp template matching `status` (an orders.status value,
 * e.g. 'accepted' | 'ready' | 'completed' | 'rejected' | 'cancelled') to
 * the customer who placed `orderId`. Looks up everything itself — callers
 * only need to know the order id, its shop, and its new status.
 *
 * shopId is required and enforced in the query below (not just checked
 * after the fact) — the /internal/orders/:orderId/notify route has no
 * other authorization beyond the shared internal secret, so this is the
 * only thing stopping a caller who knows any orderId from triggering a
 * notification for an order belonging to a shop it has no relationship
 * to. The WhatsApp-triggered path (messageHandler.js) already scopes its
 * own order lookups by shop_id for the same reason.
 *
 * Uses order_customer_details.customer_phone_snapshot (the phone captured
 * at order-creation time) rather than the possibly-since-changed
 * customers.phone — guarantees the notification reaches the number
 * actually used to place this specific order, and is always present
 * regardless of whether a customers row exists or was ever linked.
 *
 * Best-effort: any failure here must never affect the caller's own
 * success path (the staff-facing reply, or the dashboard's status
 * update) — callers should not let this throw uncaught.
 */
async function notifyCustomer(orderId, status, shopId) {
  const template = getTemplate(status);
  if (!template) {
    logger.warn({ orderId, status }, 'No template registered for this status — skipping notify');
    return false;
  }

  if (!shopId) {
    logger.warn({ orderId, status }, 'No shopId provided — refusing to notify');
    return false;
  }

  const supabase = getSupabase();
  if (!supabase) {
    logger.warn({ orderId, status }, 'Supabase not configured — cannot notify customer');
    return false;
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      `order_number, total_amount, subtotal, tax_amount, discount_amount, completed_at,
       pickup_slot_label, preferred_pickup_time,
       rejection_reason, cancellation_reason, order_type, delivery_fee,
       shops ( name, currency_code, address_line_1, address_line_2, city, state, postal_code ),
       order_customer_details ( customer_name_snapshot, customer_phone_snapshot, delivery_address_snapshot ),
       order_items ( product_name_snapshot, unit_snapshot, quantity, unit_price, subtotal )`
    )
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error || !order) {
    logger.error({ error, orderId, status }, 'Failed to load order for notify');
    return false;
  }

  const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops;
  const details = Array.isArray(order.order_customer_details)
    ? order.order_customer_details[0]
    : order.order_customer_details;

  const phone = details?.customer_phone_snapshot;
  if (!phone) {
    logger.warn({ orderId, status }, 'No customer phone snapshot on this order — skipping notify');
    return false;
  }

  const customerName = details?.customer_name_snapshot || 'there';
  const shopName = shop?.name || 'the shop';

  const orderForParams = {
    ...order,
    currency_code: shop?.currency_code,
    delivery_address_snapshot: details?.delivery_address_snapshot,
  };

  // Two different component shapes depending on how the approved
  // template was actually authored — see templates.js's `mode` comment.
  // Sending the wrong shape to a template fails outright, it doesn't
  // silently coerce.
  let components;

  if (template.mode === 'named') {
    const params = template.params(orderForParams, customerName, shopName);
    components = [{
      type: 'body',
      parameters: Object.entries(params).map(([name, value]) => ({
        type: 'text',
        parameter_name: name,
        text: String(value),
      })),
    }];
  } else {
    const parameters = [customerName, order.order_number, shopName, ...template.tail(orderForParams)].map(
      (value) => ({ type: 'text', text: String(value) })
    );
    components = [{ type: 'body', parameters }];
  }

  const sent = await sendTemplateWithFallback(phone, template, components);

  // Receipt rides along with order_confirm specifically — matches the
  // v2 build brief's ACCEPT -> order_confirm + receipt flow. Not sent
  // for other statuses (ready/completed/rejected/cancelled don't repeat
  // the itemized list).
  if (sent && status === 'accepted') {
    const receiptText = buildReceiptText(orderForParams, shopName);
    const receiptSent = await sendWhatsAppMessage(phone, receiptText);
    if (receiptSent) {
      logMessage(shopId, phone, 'outbound', 'system', 'text', receiptText);
    } else {
      logger.warn({ orderId }, 'Failed to send order receipt (best-effort, not retried)');
    }
  }

  // PDF invoice — completion only, and only to the customer. Reflects
  // order_items as they stand right now, i.e. after any staff edits
  // (quantity reductions, removed items), since this fires at the
  // completion transition rather than at order-creation time. Deliberately
  // NOT wired into notifyStaffOfDashboardStatusChange (orderCreator.js) —
  // the shop owner/staff already know what they marked complete; this is
  // a customer-facing document, matching the explicit "not in shop owner
  // WhatsApp" requirement.
  if (sent && status === 'completed') {
    await sendCompletionInvoice(orderId, shopId, phone);
  }

  return sent;
}

/**
 * Loads everything generateInvoicePdfBuffer needs and renders it —
 * shared by the auto-send-on-completion path below and the dashboard's
 * on-demand "view invoice" route (internal.js), so both always reflect
 * the exact same order_items snapshot rather than two independently
 * maintained queries drifting apart. Always reads the *current*
 * order_items, i.e. after any staff edits — there's no separate
 * "final items" snapshot table, the live order_items row is that
 * snapshot once the order reaches 'completed'.
 */
async function generateOrderInvoicePdf(orderId, shopId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      `order_number, total_amount, subtotal, tax_amount, discount_amount, completed_at,
       shops ( name, currency_code, address_line_1, address_line_2, city, state, postal_code ),
       order_customer_details ( customer_name_snapshot ),
       order_items ( product_name_snapshot, unit_snapshot, quantity, unit_price, subtotal )`
    )
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error || !order) {
    logger.error({ error, orderId, shopId }, 'Failed to load order for invoice');
    return null;
  }

  const { data: connection } = await supabase
    .from('whatsapp_connections')
    .select('display_phone_number')
    .eq('shop_id', shopId)
    .maybeSingle();

  const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops;
  const details = Array.isArray(order.order_customer_details)
    ? order.order_customer_details[0]
    : order.order_customer_details;

  const buffer = await generateInvoicePdfBuffer({
    shop: { ...shop, displayPhone: connection?.display_phone_number || null },
    order: { ...order, customerName: details?.customer_name_snapshot || null },
    items: order.order_items || [],
    currencyCode: shop?.currency_code,
  });

  return { buffer, orderNumber: order.order_number };
}

/**
 * Generates the invoice PDF and sends it via WhatsApp's Media API
 * (upload -> get media id -> send as a document message) rather than
 * hosting it at a public URL — no new storage bucket needed, consistent
 * with how the rest of this file avoids building document infrastructure
 * beyond what's actually asked for. Best-effort and not retried, same as
 * the receipt above: a failure here must never surface to the caller,
 * since the order's own status change already succeeded.
 */
async function sendCompletionInvoice(orderId, shopId, phone) {
  try {
    const result = await generateOrderInvoicePdf(orderId, shopId);
    if (!result) {
      logger.warn({ orderId }, 'Invoice generation failed — skipping invoice send (best-effort)');
      return;
    }

    const { buffer: pdfBuffer, orderNumber } = result;
    const filename = `Invoice-${orderNumber}.pdf`;
    const mediaId = await uploadWhatsAppMedia(pdfBuffer, filename, 'application/pdf');

    if (!mediaId) {
      logger.warn({ orderId }, 'Invoice media upload failed — skipping invoice send (best-effort)');
      return;
    }

    const invoiceSent = await sendWhatsAppDocument(phone, mediaId, filename, `🧾 Invoice for your order`);
    if (invoiceSent) {
      logMessage(shopId, phone, 'outbound', 'system', 'document', `Invoice PDF for order ${orderId}`);
    } else {
      logger.warn({ orderId }, 'Failed to send invoice PDF (best-effort, not retried)');
    }
  } catch (err) {
    logger.error({ err, orderId }, 'Invoice generation/send threw (best-effort)');
  }
}

/**
 * Tells the customer what actually changed when staff edits a pending
 * order (a quantity reduced because only 1 of the 2 they ordered was in
 * stock, an item dropped entirely). Without this, the only signal a
 * customer ever got was a total that quietly didn't match what they
 * remembered ordering, with no explanation. Plain text, not a template
 * — the order was placed recently enough that the shop is still
 * actively working it, well inside the 24h customer-service window.
 * Best-effort and not retried, same reasoning as the receipt: this is
 * supplementary detail, not the order's core status change.
 */
async function notifyCustomerOfOrderEdit(orderId, shopId, diffLines, newTotal) {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data: order, error } = await supabase
    .from('orders')
    .select('order_number, order_customer_details ( customer_phone_snapshot )')
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error || !order) {
    logger.error({ error, orderId }, 'Failed to load order for edit notify');
    return false;
  }

  const details = Array.isArray(order.order_customer_details)
    ? order.order_customer_details[0]
    : order.order_customer_details;
  const phone = details?.customer_phone_snapshot;

  if (!phone) {
    logger.warn({ orderId }, 'No customer phone snapshot on this order — skipping edit notify');
    return false;
  }

  const text =
    `📝 Your order *${order.order_number}* was updated by the shop:\n\n` +
    diffLines.join('\n') +
    `\n\nNew total: ₹${Number(newTotal).toFixed(2)}\n\nWe'll notify you once it's ready.`;

  const sent = await sendWhatsAppMessage(phone, text);
  if (sent) {
    logMessage(shopId, phone, 'outbound', 'system', 'text', text);
  } else {
    logger.warn({ orderId }, 'Failed to send order-edit notification (best-effort, not retried)');
  }

  return sent;
}

module.exports = { notifyCustomer, generateOrderInvoicePdf, notifyCustomerOfOrderEdit };
