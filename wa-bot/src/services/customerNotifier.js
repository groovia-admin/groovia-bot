const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');
const { getTemplate, fmtMoney } = require('./templates');
const { sendWhatsAppTemplateWithFallback, sendWhatsAppMessage, uploadWhatsAppMedia, sendWhatsAppDocument } = require('./whatsappClient');
const { logMessage } = require('./conversationLogger');
const { generateInvoicePdfBuffer } = require('./invoiceGenerator');

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

  // The itemized-receipt text that used to ride along with order_confirm
  // on ACCEPT was reported as redundant now that the same information
  // shows up again in the completion invoice PDF, and the accept
  // template itself already confirms the order/total -- removed rather
  // than kept "just in case," since a customer getting the same order
  // summarized to them twice in one flow reads as noise, not care.

  // 'completed' tries to send the invoice PDF as the template's own
  // Document header (one message) instead of a separate document send
  // (two messages) -- resubmitted in Meta 2026-08-15, PENDING approval
  // as of this comment (confirmed via a direct Graph API check, not
  // assumed). Structural mismatches against an unapproved/pending
  // template component fail synchronously from Meta (unlike the 24h-
  // window case, which Meta accepts and only fails later via webhook),
  // so trying the combined send first and falling back to today's
  // separate-messages behavior on any failure is safe right now and
  // stops needing the fallback the moment Meta approves it -- no
  // redeploy required either way.
  // Computed once up front (not inside the `if` below) so the fallback
  // path further down can reuse whatever got generated/uploaded here
  // instead of redoing both — a simplify-pass review caught this: every
  // completed order was generating the PDF and uploading it to Meta
  // twice, once here and again inside sendCompletionInvoice, since the
  // combined send below can't succeed yet (template still pending).
  let invoice = null;
  let invoiceMediaId = null;

  if (status === 'completed') {
    invoice = await generateOrderInvoicePdf(orderId, shopId);
    invoiceMediaId = invoice ? await uploadWhatsAppMedia(invoice.buffer, `Invoice-${invoice.orderNumber}.pdf`, 'application/pdf') : null;

    if (invoiceMediaId) {
      const combinedComponents = [
        { type: 'header', parameters: [{ type: 'document', document: { id: invoiceMediaId, filename: `Invoice-${invoice.orderNumber}.pdf` } }] },
        ...components,
      ];
      const combinedSent = await sendWhatsAppTemplateWithFallback(phone, template.name, template.language, combinedComponents);
      if (combinedSent) {
        logMessage(shopId, phone, 'outbound', 'system', 'document', `order_completed (with invoice header) for order ${orderId}`);
        return true;
      }
      logger.info({ orderId }, 'Combined completed+invoice template send failed (likely still pending Meta approval) — falling back to separate messages');
    }
  }

  const sent = await sendWhatsAppTemplateWithFallback(phone, template.name, template.language, components);

  // PDF invoice — completion only, and only to the customer. Reflects
  // order_items as they stand right now, i.e. after any staff edits
  // (quantity reductions, removed items), since this fires at the
  // completion transition rather than at order-creation time. Deliberately
  // NOT wired into notifyStaffOfDashboardStatusChange (orderCreator.js) —
  // the shop owner/staff already know what they marked complete; this is
  // a customer-facing document, matching the explicit "not in shop owner
  // WhatsApp" requirement. Only reached here if the combined send above
  // wasn't even attempted or didn't succeed — reuses the invoice/media
  // already generated above when available, only regenerating if that
  // generation/upload itself is what failed.
  if (sent && status === 'completed') {
    await sendCompletionInvoice(orderId, shopId, phone, invoiceMediaId ? { mediaId: invoiceMediaId, orderNumber: invoice.orderNumber } : null);
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
 *
 * `precomputed` lets a caller that already generated + uploaded the PDF
 * (the combined-header send attempt above, when it has a mediaId but the
 * template send itself failed) skip doing both again here.
 */
async function sendCompletionInvoice(orderId, shopId, phone, precomputed) {
  try {
    let mediaId = precomputed?.mediaId;
    let orderNumber = precomputed?.orderNumber;

    if (!mediaId) {
      const result = await generateOrderInvoicePdf(orderId, shopId);
      if (!result) {
        logger.warn({ orderId }, 'Invoice generation failed — skipping invoice send (best-effort)');
        return;
      }

      orderNumber = result.orderNumber;
      mediaId = await uploadWhatsAppMedia(result.buffer, `Invoice-${orderNumber}.pdf`, 'application/pdf');

      if (!mediaId) {
        logger.warn({ orderId }, 'Invoice media upload failed — skipping invoice send (best-effort)');
        return;
      }
    }

    const filename = `Invoice-${orderNumber}.pdf`;
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
 * Tells the customer what actually changed when staff edits an order (a
 * quantity reduced because only 1 of the 2 they ordered was in stock, an
 * item dropped entirely). Without this, the only signal a customer ever
 * got was a total that quietly didn't match what they remembered
 * ordering, with no explanation. Reported as still too vague even with
 * the diff line alone (no context for what the *rest* of the order
 * still looks like) -- now includes the full current item list, not
 * just what changed, matching the same itemized-list-then-total shape
 * the receipt/invoice already use elsewhere. Plain text, not a template
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
    .select(
      `order_number, shops ( currency_code ),
       order_customer_details ( customer_phone_snapshot ),
       order_items ( product_name_snapshot, unit_snapshot, quantity, subtotal )`
    )
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .maybeSingle();

  if (error || !order) {
    logger.error({ error, orderId }, 'Failed to load order for edit notify');
    return false;
  }

  const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops;
  const details = Array.isArray(order.order_customer_details)
    ? order.order_customer_details[0]
    : order.order_customer_details;
  const phone = details?.customer_phone_snapshot;

  if (!phone) {
    logger.warn({ orderId }, 'No customer phone snapshot on this order — skipping edit notify');
    return false;
  }

  const currencyCode = shop?.currency_code;
  const itemLines = (order.order_items || [])
    .map((item) => `${item.product_name_snapshot} × ${item.quantity} (${item.unit_snapshot}) — ${fmtMoney(item.subtotal, currencyCode)}`)
    .join('\n');

  const text =
    `📝 Your order *${order.order_number}* was updated by the shop:\n\n` +
    diffLines.join('\n') +
    `\n\nYour order now:\n${itemLines}\n\n` +
    `*New total: ${fmtMoney(newTotal, currencyCode)}*\n\nWe'll notify you once it's ready.`;

  const sent = await sendWhatsAppMessage(phone, text);
  if (sent) {
    logMessage(shopId, phone, 'outbound', 'system', 'text', text);
  } else {
    logger.warn({ orderId }, 'Failed to send order-edit notification (best-effort, not retried)');
  }

  return sent;
}

module.exports = { notifyCustomer, generateOrderInvoicePdf, notifyCustomerOfOrderEdit };
