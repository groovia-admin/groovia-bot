const logger = require('../utils/logger');
const { getSupabase, getActiveStaffPhones } = require('./shopResolver');
const { sendWhatsAppTemplateWithFallback } = require('./whatsappClient');
const { notifyCustomer } = require('./customerNotifier');

// Registered separately from templates.js's ORDER_TEMPLATES registry —
// that one is keyed by orders.status for customer-facing notifications;
// this is staff-facing, same category as orderCreator.js's own
// NEW_ORDER_ALERT_TEMPLATE. Final submitted text:
//   Category: Utility, Name: order_reminder, Language: en_US (as
//   originally declared here — but confirmed in production that Meta
//   rejects it under en_US with #132001 "template name does not exist
//   in the translation", so it was evidently approved under a different
//   language code. Sent via sendWhatsAppTemplateWithFallback below
//   instead of a raw single-language call, same fix as every other
//   template send already has — this was the one place in the codebase
//   still missing it, and the only one with zero retry/fallback safety
//   net, so every reminder was silently failing outright.
//   Body:
//     "⏰ Reminder:
//
//      Order *{{1}}* has been waiting since *{{2}}* for your response.
//
//      Please *Accept* or *Reject* soon.
//
//      Thank you😊"
//   {{1}} = order number (e.g. "ORD-4F2A9C1B"), {{2}} = the clock time
//   the shop was first alerted (e.g. "2:30 PM", in the shop's own
//   timezone) — NOT a duration; the wording is "waiting since", not
//   "waiting for".
//   Buttons: 2 quick-reply — "✅ Accept" / "❌ Reject" (no Edit, unlike
//   new_order_alert's 3 — still reachable from the original alert
//   message already in the staff's chat, keeps this a quick nudge).
const ORDER_REMINDER_TEMPLATE = { name: 'order_reminder', language: 'en_US' };

// Remind at most this many times before giving up and leaving the order
// to auto-reject (if configured) or just sit — an ignored order
// shouldn't page staff forever if a shop has reminders on but no
// auto-reject threshold set.
const MAX_REMINDERS = 3;
const REMINDER_INTERVAL_MINUTES = 10;

// "2:30 PM" style — the template says "waiting since {{2}}", a clock
// time, not a duration. Shop's own timezone, same pattern already used
// for hourly pickup slots (messageHandler.js) — a bare server-local
// time would be meaningless to staff.
function formatTime(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

async function sendReminder(supabase, order, timezone) {
  // Claim atomically FIRST, then send — same fix, same reasoning, as
  // processDueNewOrderAlerts in orderCreator.js (which had a confirmed
  // production double-send from this exact send-then-mark ordering: two
  // overlapping ticks/replicas both pass the eligibility check above
  // before either reaches its own mark). The optimistic-concurrency
  // guard (.eq('reminder_count', ...)) only prevents double-*counting*
  // if it runs after the send; run first, it prevents double-*sending*.
  const { data: claimed, error: claimError } = await supabase
    .from('orders')
    .update({ reminder_count: order.reminder_count + 1, last_reminder_at: new Date().toISOString() })
    .eq('id', order.id)
    .eq('reminder_count', order.reminder_count)
    .select('id')
    .maybeSingle();

  if (claimError) {
    logger.error({ error: claimError, orderId: order.id }, 'Failed to record reminder send');
    return;
  }

  if (!claimed) return; // another tick already claimed and sent this reminder

  const waitingSince = formatTime(new Date(order.shop_alert_sent_at), timezone);

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: order.order_number },
        { type: 'text', text: waitingSince },
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

  const phones = await getActiveStaffPhones(order.shop_id);
  await Promise.all(
    phones.map((phone) =>
      sendWhatsAppTemplateWithFallback(phone, ORDER_REMINDER_TEMPLATE.name, ORDER_REMINDER_TEMPLATE.language, components)
    )
  );
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
  const [{ data: settingsRows, error: settingsError }, { data: shopRows, error: shopsError }] = await Promise.all([
    supabase.from('shop_settings').select('shop_id, reminder_enabled, auto_reject_after_minutes').in('shop_id', shopIds),
    supabase.from('shops').select('id, timezone').in('id', shopIds),
  ]);

  if (settingsError) {
    logger.error({ error: settingsError }, 'Failed to load shop settings for reminder check');
    return;
  }

  if (shopsError) {
    logger.error({ error: shopsError }, 'Failed to load shop timezones for reminder check');
    return;
  }

  const settingsByShop = new Map((settingsRows || []).map((s) => [s.shop_id, s]));
  const timezoneByShop = new Map((shopRows || []).map((s) => [s.id, s.timezone]));
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
      await sendReminder(supabase, order, timezoneByShop.get(order.shop_id));
    }
  }
}

module.exports = { processDueReminders };
