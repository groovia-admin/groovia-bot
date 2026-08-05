const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');
const { getTemplate } = require('./templates');
const { sendWhatsAppTemplate } = require('./whatsappClient');

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
  const languages = LANGUAGE_FALLBACKS.includes(template.language)
    ? LANGUAGE_FALLBACKS
    : [template.language, ...LANGUAGE_FALLBACKS];

  for (const language of languages) {
    const sent = await sendWhatsAppTemplate(phone, template.name, language, components);
    if (sent) return true;
  }

  return false;
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
      `order_number, total_amount, pickup_slot_label, preferred_pickup_time,
       rejection_reason, cancellation_reason,
       shops ( name, currency_code ),
       order_customer_details ( customer_name_snapshot, customer_phone_snapshot )`
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

  const orderForParams = { ...order, currency_code: shop?.currency_code };

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

  return sendTemplateWithFallback(phone, template, components);
}

module.exports = { notifyCustomer };
