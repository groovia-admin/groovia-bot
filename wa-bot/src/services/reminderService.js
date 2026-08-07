const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');
const { sendWhatsAppTemplate } = require('./whatsappClient');
const { notifyCustomer } = require('./customerNotifier');

// Registered separately from templates.js's ORDER_TEMPLATES registry —
// that one is keyed by orders.status for customer-facing notifications;
// this is staff-facing, same category as orderCreator.js's own
// NEW_ORDER_ALERT_TEMPLATE. Submitted to Meta as:
//   Category: Utility, Name: order_reminder, Language: en_US
//   Body: "⏰ Reminder: Order {{1}} has been waiting {{2}} for your
//          response. Please Accept or Reject soon."
//   {{1}} = order number (e.g. "ORD-4F2A9C1B"), {{2}} = human-readable
//   wait time (e.g. "15 minutes")
//   Buttons: 2 quick-reply — "✅ Accept" / "❌ Reject" (no Edit, unlike
//   new_order_alert's 3 — still reachable from the original alert
//   message already in the staff's chat, keeps this a quick nudge).
// Not yet approved as of this commit — nothing here sends successfully
// until it is (same situation new_order_alert was in before its own
// approval). Correct this comment + the components below if the
// actually-approved text ends up differing at all.
const ORDER_REMINDER_TEMPLATE = { name: 'order_reminder', language: 'en_US' };

// Remind at most this many times before giving up and leaving the order
// to auto-reject (if configured) or just sit — an ignored order
// shouldn't page staff forever if a shop has reminders on but no
// auto-reject threshold set.
const MAX_REMINDERS = 3;
const REMINDER_INTERVAL_MINUTES = 10;

function formatDuration(minutes) {
  if (minutes < 60) return `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

async function loadActiveStaffPhones(supabase, shopId) {
  const { data, error } = await supabase
    .from('shop_users')
    .select('phone_number')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .not('phone_number', 'is', null);

  if (error) {
    logger.error({ error, shopId }, 'Failed to load shop staff for reminder');
    return [];
  }

  return (data || []).map((s) => s.phone_number);
}

async function sendReminder(supabase, order) {
  const minutesWaiting = (Date.now() - new Date(order.shop_alert_sent_at).getTime()) / 60000;

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: order.order_number },
        { type: 'text', text: formatDuration(minutesWaiting) },
      ],
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '0',
      parameters: [{ type: 'payload', payload: `accept_${order.id}` }],
    },
    {
      type: 'button',
      sub_type: 'quick_reply',
      index: '1',
      parameters: [{ type: 'payload', payload: `reject_${order.id}` }],
    },
  ];

  const phones = await loadActiveStaffPhones(supabase, order.shop_id);
  await Promise.all(
    phones.map((phone) =>
      sendWhatsAppTemplate(phone, ORDER_REMINDER_TEMPLATE.name, ORDER_REMINDER_TEMPLATE.language, components)
    )
  );

  // Optimistic-concurrency guard (.eq('reminder_count', ...)) rather
  // than a blind increment — if two poll ticks ever overlapped on the
  // same order, only the first one's update actually matches and takes
  // effect, so the count can't drift ahead by more than one per real
  // reminder sent.
  const { error } = await supabase
    .from('orders')
    .update({ reminder_count: order.reminder_count + 1, last_reminder_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('reminder_count', order.reminder_count);

  if (error) {
    logger.error({ error, orderId: order.id }, 'Failed to record reminder send');
  }
}

async function autoRejectOrder(supabase, order) {
  const { data: updated, error } = await supabase
    .from('orders')
    .update({
      status: 'rejected',
      rejection_reason: 'Automatically rejected — no response from the shop',
      rejected_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('status', 'pending') // same race guard used everywhere else a status transition happens
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error({ error, orderId: order.id }, 'Failed to auto-reject order');
    return;
  }

  if (!updated) return; // someone else already acted on it — nothing to notify

  try {
    await notifyCustomer(order.id, 'rejected', order.shop_id);
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'Failed to notify customer of auto-rejection');
  }
}

/**
 * Periodic scan (index.js, same 60s-poll pattern as
 * processDueNewOrderAlerts) — DB-backed rather than a per-order
 * setTimeout for the same restart-safety reason as everything else in
 * this delayed-action family: a Railway redeploy must never silently
 * drop a scheduled reminder or auto-reject.
 *
 * Only touches orders whose staff alert has actually gone out
 * (shop_alert_sent_at IS NOT NULL) — one still inside its 5-minute
 * customer-cancel window has never been shown to staff yet, so there's
 * nothing for them to have ignored.
 */
async function processDueReminders() {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, shop_id, order_number, reminder_count, last_reminder_at, shop_alert_sent_at')
    .eq('status', 'pending')
    .not('shop_alert_sent_at', 'is', null);

  if (error) {
    logger.error({ error }, 'Failed to load orders due for a reminder/auto-reject check');
    return;
  }

  if (!orders || orders.length === 0) return;

  const shopIds = [...new Set(orders.map((o) => o.shop_id))];
  const { data: settingsRows, error: settingsError } = await supabase
    .from('shop_settings')
    .select('shop_id, reminder_enabled, auto_reject_after_minutes')
    .in('shop_id', shopIds);

  if (settingsError) {
    logger.error({ error: settingsError }, 'Failed to load shop settings for reminder check');
    return;
  }

  const settingsByShop = new Map((settingsRows || []).map((s) => [s.shop_id, s]));
  const now = Date.now();

  for (const order of orders) {
    const settings = settingsByShop.get(order.shop_id);
    if (!settings) continue;

    const minutesSinceAlert = (now - new Date(order.shop_alert_sent_at).getTime()) / 60000;

    if (settings.auto_reject_after_minutes && minutesSinceAlert >= settings.auto_reject_after_minutes) {
      await autoRejectOrder(supabase, order);
      continue;
    }

    if (!settings.reminder_enabled) continue;
    if (order.reminder_count >= MAX_REMINDERS) continue;

    const lastActionAt = order.last_reminder_at ? new Date(order.last_reminder_at).getTime() : new Date(order.shop_alert_sent_at).getTime();
    const minutesSinceLastAction = (now - lastActionAt) / 60000;

    if (minutesSinceLastAction >= REMINDER_INTERVAL_MINUTES) {
      await sendReminder(supabase, order);
    }
  }
}

module.exports = { processDueReminders };
