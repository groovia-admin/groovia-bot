const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');
const { getTemplate } = require('./templates');
const { sendWhatsAppTemplate } = require('./whatsappClient');

/**
 * Sends the WhatsApp template matching `status` (an orders.status value,
 * e.g. 'accepted' | 'ready' | 'completed' | 'rejected' | 'cancelled') to
 * the customer who placed `orderId`. Looks up everything itself — callers
 * only need to know the order id and its new status.
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
async function notifyCustomer(orderId, status) {
  const template = getTemplate(status);
  if (!template) {
    logger.warn({ orderId, status }, 'No template registered for this status — skipping notify');
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

  const orderForTail = { ...order, currency_code: shop?.currency_code };

  const parameters = [customerName, order.order_number, shopName, ...template.tail(orderForTail)].map(
    (value) => ({ type: 'text', text: String(value) })
  );

  const components = [{ type: 'body', parameters }];

  return sendWhatsAppTemplate(phone, template.name, template.language, components);
}

module.exports = { notifyCustomer };
