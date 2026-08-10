const logger = require('../utils/logger');
const { getSupabase, getActiveStaffPhones } = require('./shopResolver');
const { sendWhatsAppTemplateWithFallback } = require('./whatsappClient');

// Proactive, staff-initiated-nothing push at a scheduled time of day —
// same reasoning as new_order_alert/order_reminder for why this has to
// be an approved template rather than a plain message: there's no
// guarantee the shop messaged the bot in the last 24h, so a plain text
// send would silently fail outside that window on exactly the shops
// least actively using WhatsApp that morning.
//
// NOT YET CREATED IN META — this name/shape is what the code expects;
// an actual template matching it still needs to be submitted and
// approved in WhatsApp Manager before this can send anything in
// production (same manual step order_reminder/appointment_reminder
// needed). Fixed-shape body: WhatsApp templates can't render a
// dynamic-length list, so "top products" is always exactly 3 numbered
// lines, with unused slots filled with "—" rather than omitted.
//   Category: Utility, Language: en_US
//   Body:
//     "📊 Yesterday's summary for *{{1}}*
//
//      🛒 Orders: {{2}}
//      💰 Revenue: ₹{{3}}
//      📈 Avg order: ₹{{4}}
//
//      🏆 Top products:
//      1. {{5}}
//      2. {{6}}
//      3. {{7}}
//
//      Have a great day! 🙏"
const DAILY_SUMMARY_TEMPLATE = { name: 'daily_summary', language: 'en_US' };
const TOP_PRODUCTS_SLOTS = 3;

// 'YYYY-MM-DD' for `date` as it reads on a wall clock in `timezone` —
// used both to know "which calendar day is it there right now" and to
// tag last_daily_summary_sent_date with the shop's own date, not the
// server's UTC one (those disagree for several hours a day in India).
function formatDateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function getCurrentHourMinuteInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { hour: Number(map.hour) % 24, minute: Number(map.minute) };
}

// UTC offset (in minutes) `timezone` is at during `date` — computed from
// Intl's own shortOffset output (e.g. "GMT+5:30") rather than hardcoded,
// so this isn't silently wrong for a shop in a different timezone or a
// DST transition, the way a hardcoded +5:30 would be.
function getUtcOffsetMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0';
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(offsetPart);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

// The [00:00, 24:00) window of `dateStr` (a shop-local calendar day) as
// UTC instants, so orders.created_at (timestamptz) can be filtered
// directly against it. Offset computed at midday of that date rather
// than at midnight itself, purely to stay well clear of the instant a
// DST transition (if the timezone ever has one) could occur.
function shopLocalDayToUtcRange(dateStr, timezone) {
  const offsetMinutes = getUtcOffsetMinutes(new Date(`${dateStr}T12:00:00Z`), timezone);
  const startUtc = new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - offsetMinutes * 60000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}

/**
 * Orders/revenue/top-products for one shop's previous shop-local
 * calendar day. Revenue and average order value are computed only from
 * 'completed' orders — a rejected/cancelled order was never actually
 * fulfilled or paid for, so counting it as revenue would overstate the
 * day. Total order count is every order created that day regardless of
 * status, since that's a demand signal, not a money one.
 */
async function computeSummaryForShop(supabase, shop) {
  const yesterday = formatDateInTimezone(new Date(Date.now() - 24 * 60 * 60 * 1000), shop.timezone);
  const { startUtc, endUtc } = shopLocalDayToUtcRange(yesterday, shop.timezone);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, status, total_amount')
    .eq('shop_id', shop.id)
    .gte('created_at', startUtc.toISOString())
    .lt('created_at', endUtc.toISOString());

  if (error) {
    logger.error({ error, shopId: shop.id }, 'Failed to load orders for daily summary');
    return null;
  }

  const totalOrders = orders?.length || 0;
  const completedOrders = (orders || []).filter((o) => o.status === 'completed');
  const revenue = completedOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const avgOrderValue = completedOrders.length > 0 ? revenue / completedOrders.length : 0;

  let topProducts = [];
  if (completedOrders.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('product_name_snapshot, quantity')
      .in('order_id', completedOrders.map((o) => o.id));

    if (itemsError) {
      logger.error({ error: itemsError, shopId: shop.id }, 'Failed to load order items for daily summary');
    } else {
      const counts = new Map();
      for (const item of items || []) {
        counts.set(item.product_name_snapshot, (counts.get(item.product_name_snapshot) || 0) + item.quantity);
      }
      topProducts = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_PRODUCTS_SLOTS);
    }
  }

  return { totalOrders, revenue, avgOrderValue, topProducts, dateLabel: yesterday };
}

async function sendDailySummary(shop, summary) {
  const phones = await getActiveStaffPhones(shop.id);
  if (phones.length === 0) return;

  const productLines = Array.from({ length: TOP_PRODUCTS_SLOTS }, (_, i) => {
    const entry = summary.topProducts[i];
    return entry ? `${entry[0]} — ${entry[1]} sold` : '—';
  });

  const components = [
    {
      type: 'body',
      parameters: [
        shop.name,
        String(summary.totalOrders),
        summary.revenue.toFixed(2),
        summary.avgOrderValue.toFixed(2),
        ...productLines,
      ].map((value) => ({ type: 'text', text: value })),
    },
  ];

  await Promise.all(
    phones.map((phone) =>
      sendWhatsAppTemplateWithFallback(phone, DAILY_SUMMARY_TEMPLATE.name, DAILY_SUMMARY_TEMPLATE.language, components)
    )
  );
}

/**
 * Periodic scan (index.js, same poll-and-claim pattern as reminders/
 * auto-reject/new-order-alerts) — checked every tick rather than
 * scheduled per-shop, so a Railway restart can never cause a shop's
 * summary to silently never fire. Each shop is only ever sent to once
 * per shop-local calendar day: last_daily_summary_sent_date is claimed
 * atomically (the UPDATE's own WHERE clause is the concurrency guard,
 * same "claim before acting" fix already applied to reminders and
 * new-order alerts after a confirmed production double-send) before
 * anything is sent, so two overlapping ticks can't both send it.
 */
async function processDueDailySummaries() {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: shops, error } = await supabase
    .from('shops')
    .select('id, name, timezone, shop_settings!inner ( daily_summary_enabled, daily_summary_time, last_daily_summary_sent_date )')
    .eq('is_active', true)
    .eq('shop_settings.daily_summary_enabled', true);

  if (error) {
    logger.error({ error }, 'Failed to load shops for daily summary scan');
    return;
  }

  const now = new Date();

  for (const shop of shops || []) {
    const settings = Array.isArray(shop.shop_settings) ? shop.shop_settings[0] : shop.shop_settings;
    if (!settings) continue;

    const todayLocal = formatDateInTimezone(now, shop.timezone);
    if (settings.last_daily_summary_sent_date === todayLocal) continue; // already sent today

    const { hour, minute } = getCurrentHourMinuteInTimezone(now, shop.timezone);
    const [schedHour, schedMinute] = String(settings.daily_summary_time || '08:00').split(':').map(Number);
    const currentMinutesOfDay = hour * 60 + minute;
    const scheduledMinutesOfDay = (schedHour || 0) * 60 + (schedMinute || 0);
    if (currentMinutesOfDay < scheduledMinutesOfDay) continue; // not due yet today

    // Claim first, send second — not a separate read-then-write, this
    // UPDATE's own WHERE clause (still not today's date) is what
    // prevents a second overlapping tick from also sending.
    const { data: claimed, error: claimError } = await supabase
      .from('shop_settings')
      .update({ last_daily_summary_sent_date: todayLocal })
      .eq('shop_id', shop.id)
      .or(`last_daily_summary_sent_date.is.null,last_daily_summary_sent_date.neq.${todayLocal}`)
      .select('shop_id')
      .maybeSingle();

    if (claimError) {
      logger.error({ error: claimError, shopId: shop.id }, 'Failed to claim daily summary send');
      continue;
    }
    if (!claimed) continue; // another tick already claimed this shop's summary for today

    try {
      const summary = await computeSummaryForShop(supabase, shop);
      if (summary) await sendDailySummary(shop, summary);
    } catch (err) {
      logger.error({ err, shopId: shop.id }, 'Daily summary send threw');
    }
  }
}

module.exports = { processDueDailySummaries };
