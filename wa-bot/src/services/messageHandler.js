const logger = require('../utils/logger');
const config = require('../config');
const {
  getSupabase,
  resolveShopByPhoneNumberId,
  resolveShopUserGlobal,
  findShopBySlug,
  findNearbyShops,
  getShopDisplayPhone,
} = require('./shopResolver');
const { sendWhatsAppMessage, sendCatalogMessage, sendButtonMessage, sendListMessage, sendCtaUrlMessage } = require('./whatsappClient');
const { notifyCustomer } = require('./customerNotifier');
const { logMessage } = require('./conversationLogger');
const { getSession, createSession, updateSession, deleteSession } = require('./sessionStore');
// Aliased — sessionStore.js's createSession (above) is the existing
// native-catalog cart flow's session; this is the unrelated Phase 1 v2
// session spine (order_sessions), for the new webview entry points.
const { createSession: createOrderSession } = require('./sessionService');
const {
  buildCartFromOrderMessage,
  cartTotal,
  createOrderFromSession,
  cancelOrderByCustomer,
  sendNewOrderAlertTemplateFallback,
  buildOrderPlacedPayload,
} = require('./orderCreator');
const { getOrderWithItems, createEditLink } = require('./orderEditor');
const deliveryTracker = require('./deliveryTracker');

// ── Dynamic hourly pickup slots ──────────────────────────────────
// Replaces the old hardcoded 3-slot list — real slots now come from
// the shop's own configured business_hours (dashboard: Settings ->
// Bot behavior), generated hourly for the rest of today. List messages
// cap at 10 rows total, so this caps at 9 to leave room in case a
// "done"-style row is ever added later.
const MAX_PICKUP_SLOTS = 9;

function getCurrentHourAndMinute(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());

  return {
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24,
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
  };
}

function formatHourLabel(hour) {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:00 ${period}`;
}

// Deliberately today-only for now — a shop open past midnight, or a
// customer ordering after closing for pickup tomorrow, isn't handled
// here. Returns [] if the shop hasn't configured hours, or if there's
// no time left today to offer.
function generateHourlySlots(businessHours, timezone) {
  if (!businessHours?.open || !businessHours?.close) return [];

  const [openHour] = String(businessHours.open).split(':').map(Number);
  const [closeHour] = String(businessHours.close).split(':').map(Number);

  if (!Number.isInteger(openHour) || !Number.isInteger(closeHour) || closeHour <= openHour) {
    return [];
  }

  const { hour: currentHour, minute: currentMinute } = getCurrentHourAndMinute(timezone);

  // The current hour's slot is already (partly) gone once we're inside
  // it — e.g. at 2:15pm the 2-3pm slot no longer makes sense to offer,
  // so the earliest option becomes 3-4pm.
  const nextFullHour = currentMinute > 0 ? currentHour + 1 : currentHour;
  const startHour = Math.max(openHour, nextFullHour);

  const slots = [];
  for (let h = startHour; h < closeHour && slots.length < MAX_PICKUP_SLOTS; h++) {
    slots.push({ id: `slot_${h}`, hour: h, label: `${formatHourLabel(h)} – ${formatHourLabel(h + 1)}` });
  }

  return slots;
}

async function getPickupSlots(shopId) {
  const supabase = getSupabase();
  if (!supabase) return [];

  const [{ data: shop }, { data: settings }] = await Promise.all([
    supabase.from('shops').select('timezone').eq('id', shopId).maybeSingle(),
    supabase.from('shop_settings').select('business_hours').eq('shop_id', shopId).maybeSingle(),
  ]);

  return generateHourlySlots(settings?.business_hours, shop?.timezone);
}

const PAYMENT_OPTIONS = [
  { id: 'pay_cash', label: 'Cash at counter', value: 'cash' },
  { id: 'pay_upi', label: 'UPI / GPay', value: 'upi' },
];

// ── Deduplication ──────────────────────────────────────────────
const processedMessages = new Set();
const DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function markProcessed(id) {
  processedMessages.add(id);
  setTimeout(() => processedMessages.delete(id), DEDUP_TTL_MS).unref();
}

// ── Command parser ─────────────────────────────────────────────
function parseCommand(text) {
  if (!text) return null;
  const upper = text.trim().toUpperCase();

  const acceptMatch = text.trim().match(/^ACCEPT\s+(ORD-[\w-]+)$/i);
  if (acceptMatch) return { command: 'ACCEPT', orderNumber: acceptMatch[1].toUpperCase() };

  const rejectMatch = text.trim().match(/^REJECT\s+(ORD-[\w-]+)(?:\s+(.+))?$/i);
  if (rejectMatch) return { command: 'REJECT', orderNumber: rejectMatch[1].toUpperCase(), reason: rejectMatch[2] || 'Rejected by shopkeeper' };

  const readyMatch = text.trim().match(/^READY\s+(ORD-[\w-]+)$/i);
  if (readyMatch) return { command: 'READY', orderNumber: readyMatch[1].toUpperCase() };

  const completeMatch = text.trim().match(/^(?:COMPLETE|DONE)\s+(ORD-[\w-]+)$/i);
  if (completeMatch) return { command: 'COMPLETE', orderNumber: completeMatch[1].toUpperCase() };

  if (['HELP', 'HI', 'HELLO', 'START'].includes(upper)) return { command: 'HELP' };

  if (['CATALOG', 'PRODUCTS', 'STOCK'].includes(upper)) return { command: 'CATALOG' };

  return null;
}

// Offered as a tap-to-advance button after a successful transition, so
// staff never have to type a command for the rest of the lifecycle —
// only the very first step (a new order arriving) can't avoid a choice,
// and that's now also buttons (see notifyShopOfNewOrder).
const NEXT_STEP_BUTTON = {
  accepted: (order) => ({ id: `ready_${order.id}`, title: '📦 Mark ready' }),
  ready:    (order) => ({ id: `complete_${order.id}`, title: '✅ Mark complete' }),
};

// ── Order command handler ──────────────────────────────────────
// `parsed` identifies the order either by orderNumber (typed commands,
// e.g. "ACCEPT ORD-1234") or orderId (button taps, which carry the id
// directly rather than making staff type anything) — exactly one of the
// two is set by the caller.
async function handleOrderCommand(from, parsed, shopId, shopUser) {
  const supabase = getSupabase();

  if (!supabase) {
    await sendWhatsAppMessage(from, '⚠️ System error. Please try again later.');
    return;
  }

  const { command, orderNumber, orderId, reason } = parsed;

  // Find order — scoped to the sender's resolved shop, so a spoofed or
  // guessed order number/id belonging to a different shop can never match.
  let query = supabase
    .from('orders')
    .select('id, order_number, status, total_amount, shop_id')
    .eq('shop_id', shopId);
  query = orderId ? query.eq('id', orderId) : query.eq('order_number', orderNumber);

  const { data: order, error } = await query.single();

  if (error || !order) {
    await sendWhatsAppMessage(from,
      orderNumber
        ? `❌ Order *${orderNumber}* not found.\nPlease check the order number and try again.`
        : `❌ Order not found. It may already have been updated by someone else.`
    );
    return;
  }

  // Validate status transition
  const validTransitions = {
    ACCEPT:   { from: 'pending',  to: 'accepted'  },
    REJECT:   { from: 'pending',  to: 'rejected'  },
    READY:    { from: 'accepted', to: 'ready'     },
    COMPLETE: { from: 'ready',    to: 'completed' },
  };

  const transition = validTransitions[command];
  if (order.status !== transition.from) {
    await sendWhatsAppMessage(from,
      `⚠️ Cannot ${command.toLowerCase()} order *${order.order_number}*.\n` +
      `Current status: *${order.status.toUpperCase()}*\n` +
      `It must be *${transition.from.toUpperCase()}* for this action — someone may have already updated it.`
    );
    return;
  }

  // Build update payload
  const updateData = {
    status: transition.to,
    last_updated_via: 'whatsapp',
    updated_at: new Date().toISOString(),
  };
  if (command === 'ACCEPT')   updateData.accepted_at   = new Date().toISOString();
  if (command === 'REJECT')  { updateData.rejected_at  = new Date().toISOString(); updateData.rejection_reason = reason; }
  if (command === 'READY')    updateData.ready_at      = new Date().toISOString();
  if (command === 'COMPLETE') updateData.completed_at  = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', order.id);

  if (updateError) {
    logger.error({ updateError, orderNumber: order.order_number }, 'Order update failed');
    await sendWhatsAppMessage(from, `❌ Failed to update order *${order.order_number}*. Please try again.`);
    return;
  }

  // Write audit log — best-effort. supabase-js query builders are
  // thenables (awaitable), not real Promise instances, so they have no
  // .catch() method; chaining one directly throws a TypeError instead of
  // suppressing the error the way it looks like it should. A plain
  // try/await/catch is the correct way to make this non-fatal.
  // NOTE: not adding a changed_by_shop_user column here yet — this table
  // isn't in the typed schema anywhere in the repo, so its real columns
  // aren't verifiable from code. Confirm the schema before extending this
  // insert; shopUser.id/fullName are available in scope when that's ready.
  try {
    const { error: logError } = await supabase.from('order_status_logs').insert({
      order_id:    order.id,
      status_from: order.status,
      status_to:   transition.to,
      changed_via: 'whatsapp',
      notes:       reason || null,
    });
    if (logError) {
      logger.error({ error: logError, orderId: order.id }, 'Failed to write order_status_logs entry');
    }
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'order_status_logs insert threw');
  }

  // Notify the customer — best-effort. Must never affect the staff-facing
  // reply below, even if the template isn't approved yet, the order has
  // no phone snapshot, or Meta's API errors.
  try {
    await notifyCustomer(order.id, transition.to, order.shop_id);
  } catch (err) {
    logger.error({ err, orderNumber: order.order_number, command }, 'Customer notify failed');
  }

  // Confirm to shopkeeper
  const replies = {
    ACCEPT:   `✅ Order *${order.order_number}* accepted!\nCustomer will be notified.`,
    REJECT:   `❌ Order *${order.order_number}* rejected.\nReason: ${reason}\nCustomer will be notified.`,
    READY:    `🎉 Order *${order.order_number}* is ready for pickup!\nCustomer will be notified.`,
    COMPLETE: `✔️ Order *${order.order_number}* completed. Well done!`,
  };

  await sendWhatsAppMessage(from, replies[command]);

  // Tap-to-advance to the next step, if there is one (nothing follows
  // REJECT or COMPLETE).
  const nextButton = NEXT_STEP_BUTTON[transition.to]?.(order);
  if (nextButton) {
    await sendButtonMessage(from, 'Ready for the next step?', [nextButton]);
  }

  logger.info({ orderNumber: order.order_number, from: order.status, to: transition.to }, 'Order updated via WhatsApp');
}

// ── Staff button-tap handler ─────────────────────────────────────
// Button ids are "<accept|reject|ready|complete|edit>_<orderId>" — the
// order is identified by its own id, not typed, so there's nothing to
// get wrong.
const STAFF_BUTTON_COMMANDS = {
  accept: 'ACCEPT',
  reject: 'REJECT',
  ready: 'READY',
  complete: 'COMPLETE',
};

// Replaces the old chat-based flow (a tap-to-adjust list, or a >9-item
// text fallback of "reply with item numbers" / "edit N" / "done") —
// reported as clunky and hard to use. An earlier version of this linked
// straight to the dashboard's own item editor, but the dashboard has no
// mobile layout at all (a fixed 256px sidebar with no responsive
// handling) and requires an OTP login — confirmed useless from a phone
// on both counts. Now issues a fresh signed, no-login link
// (createEditLink) to a dedicated mobile-first page
// (/staff-edit/{orderId}?t={token}) instead — same "hashed random token
// in the URL, no session" pattern the customer webview already uses,
// just for this one order rather than a customer's whole session.
async function sendEditPrompt(from, shopId, orderId) {
  const loaded = await getOrderWithItems(orderId, shopId);
  if (!loaded) {
    await sendWhatsAppMessage(from, '❌ Order not found.');
    return;
  }

  // 'accepted' stays editable too — editing a 'pending' order now
  // auto-accepts it on the first change (see the item-edit API routes),
  // so this can't require 'pending' specifically without locking staff
  // out of any further edits right after that first one.
  if (loaded.order.status !== 'pending' && loaded.order.status !== 'accepted') {
    await sendWhatsAppMessage(from, `⚠️ Order *${loaded.order.order_number}* can no longer be edited (already ${loaded.order.status}).`);
    return;
  }

  if (!config.webviewBaseUrl) {
    logger.warn({ shopId, orderId }, 'WEBVIEW_BASE_URL not configured — cannot send the edit link');
    await sendWhatsAppMessage(from, '⚠️ Order editing isn\'t set up yet — please contact support.');
    return;
  }

  const token = await createEditLink(orderId, shopId);
  if (!token) {
    await sendWhatsAppMessage(from, '⚠️ Could not start editing right now. Please try again, or Accept/Reject as-is.');
    return;
  }

  const link = `${config.webviewBaseUrl}/staff-edit/${orderId}?t=${token}`;
  const text = `✏️ Adjust items for order *${loaded.order.order_number}* — tap below. The customer is notified automatically once you save.`;

  await sendCtaUrlMessage(from, text, 'Edit Order', link);
  logMessage(shopId, from, 'outbound', 'system', 'interactive', text);
}

// Same link-out pattern as sendEditPrompt above — no chat-based product
// add/edit flow, since the dashboard's own products page (name, price,
// stock, photo, categories) already does this well and building an
// equivalent in WhatsApp text messages would mean re-typing all of that
// through chat, badly. /dashboard/products specifically, not
// /dashboard/catalog — the latter is the super-admin-only master
// catalog, not a shop's own product list.
async function sendCatalogLinkMessage(from, shopId) {
  if (!config.webviewBaseUrl) {
    logger.warn({ shopId }, 'WEBVIEW_BASE_URL not configured — cannot send the dashboard catalog link');
    await sendWhatsAppMessage(from, '⚠️ Catalog editing isn\'t set up yet — please contact support.');
    return;
  }

  const link = `${config.webviewBaseUrl}/dashboard/products`;
  const text = `🛒 Add, edit, or restock products — tap below.`;

  await sendCtaUrlMessage(from, text, 'Open Catalog', link);
  logMessage(shopId, from, 'outbound', 'system', 'interactive', text);
}

async function handleStaffButtonReply(from, shopId, shopUser, buttonId) {
  const editMatch = /^edit_(.+)$/.exec(buttonId || '');
  if (editMatch) {
    await sendEditPrompt(from, shopId, editMatch[1]);
    return;
  }

  const match = /^(accept|reject|ready|complete)_(.+)$/.exec(buttonId || '');
  if (!match) return;

  const [, action, orderId] = match;
  const command = STAFF_BUTTON_COMMANDS[action];

  await handleOrderCommand(
    from,
    { command, orderId, reason: 'Rejected by shopkeeper' },
    shopId,
    shopUser
  );
}

// ── Customer ordering flow ──────────────────────────────────────
// Item selection itself happens in WhatsApp's native Catalog+Cart (a
// `type: 'order'` message arrives once the customer submits it) — this
// only manages the short conversation after that: pickup slot, payment
// method, then confirm.

async function sendGreeting(from, shopId, name) {
  const supabase = getSupabase();
  let shopName = 'our shop';
  let welcomeMessage = null;

  if (supabase) {
    const [{ data: shop }, { data: settings }] = await Promise.all([
      supabase.from('shops').select('name').eq('id', shopId).maybeSingle(),
      supabase.from('shop_settings').select('welcome_message').eq('shop_id', shopId).maybeSingle(),
    ]);
    if (shop?.name) shopName = shop.name;
    if (settings?.welcome_message) welcomeMessage = settings.welcome_message;
  }

  const greetingText = welcomeMessage || `Namaste ${name}! 👋 Welcome to *${shopName}*.\n\nTap below to browse and order.`;
  await sendCatalogMessage(from, greetingText);
  logMessage(shopId, from, 'outbound', 'system', 'interactive', greetingText);
}

// One interactive message instead of two sequential sends (a plain text
// message followed by a button message) — each send is its own Graph API
// round trip, and the button message's own body text can carry everything
// the first message said, so there's no reason to pay for two.
async function sendSlotPrompt(shopId, from, total, note) {
  const slots = await getPickupSlots(shopId);
  const body =
    (note ? `${note}\n\n` : '') +
    `🛒 *Cart total: ₹${total.toFixed(2)}*\n\n⏰ When would you like to pick up?`;

  if (slots.length === 0) {
    const closedText = `${body}\n\n😕 Sorry, we're closed for today — please message us again during business hours.`;
    await sendWhatsAppMessage(from, closedText);
    logMessage(shopId, from, 'outbound', 'system', 'text', closedText);
    return;
  }

  // A list, not buttons — business hours can easily produce more than
  // the 3-button limit's worth of hourly slots.
  await sendListMessage(
    from,
    body,
    'Select time',
    [{ title: 'Pickup slots', rows: slots.map((s) => ({ id: s.id, title: s.label })) }]
  );
  logMessage(shopId, from, 'outbound', 'system', 'interactive', body);
}

async function sendPaymentPrompt(shopId, from) {
  const body = '💳 Payment method:';
  await sendButtonMessage(
    from,
    body,
    PAYMENT_OPTIONS.map((p) => ({ id: p.id, title: p.label }))
  );
  logMessage(shopId, from, 'outbound', 'system', 'interactive', body);
}

async function sendConfirmPrompt(shopId, from, session) {
  const itemLines = session.cart_items
    .map((i) => `${i.name} × ${i.quantity} — ₹${i.subtotal.toFixed(2)}`)
    .join('\n');
  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.value === session.payment_method)?.label || session.payment_method;

  const text =
    `📋 *Confirm your order*\n\n${itemLines}\n\n` +
    `Total: ₹${session.cart_total.toFixed(2)}\n` +
    `⏰ Pickup: ${session.pickup_slot_label}\n` +
    `💵 Payment: ${paymentLabel}\n\n` +
    `Confirm?`;

  // 3 buttons — the max WhatsApp allows. "Change slot" loops back to
  // slot selection reusing this same session/cart rather than making
  // the customer abandon everything and re-browse the native catalog
  // from scratch just to fix a wrong pickup time.
  await sendButtonMessage(from, text, [
    { id: 'confirm_yes', title: '✅ Place order' },
    { id: 'confirm_edit_slot', title: '✏️ Change slot' },
    { id: 'confirm_no', title: '❌ Cancel' },
  ]);
  logMessage(shopId, from, 'outbound', 'system', 'interactive', text);
}

async function handleSessionButtonReply(from, shopId, session, buttonId) {
  if (session.step === 'awaiting_slot') {
    // Re-derive current slots rather than trust the tapped id blindly —
    // a stale list message tapped minutes later could reference an hour
    // that's already passed or fallen outside business hours since it
    // was sent.
    const slotMatch = /^slot_(\d+)$/.exec(buttonId || '');
    const requestedHour = slotMatch ? Number(slotMatch[1]) : null;
    const currentSlots = requestedHour !== null ? await getPickupSlots(shopId) : [];
    const slot = currentSlots.find((s) => s.hour === requestedHour);

    if (!slot) {
      await sendSlotPrompt(shopId, from, session.cart_total);
      return;
    }
    await updateSession(session.id, { step: 'awaiting_payment', pickup_slot_label: slot.label });
    await sendPaymentPrompt(shopId, from);
    return;
  }

  if (session.step === 'awaiting_payment') {
    const option = PAYMENT_OPTIONS.find((p) => p.id === buttonId);
    if (!option) {
      await sendPaymentPrompt(shopId, from);
      return;
    }
    const updated = await updateSession(session.id, { step: 'awaiting_confirm', payment_method: option.value });
    await sendConfirmPrompt(shopId, from, updated);
    return;
  }

  if (session.step === 'awaiting_confirm') {
    if (buttonId === 'confirm_edit_slot') {
      const updated = await updateSession(session.id, { step: 'awaiting_slot' });
      await sendSlotPrompt(shopId, from, updated.cart_total);
      return;
    }

    if (buttonId === 'confirm_no') {
      await deleteSession(session.id);
      const cancelText = 'Order cancelled. Message *Hi* anytime to start again.';
      await sendWhatsAppMessage(from, cancelText);
      logMessage(shopId, from, 'outbound', 'system', 'text', cancelText);
      return;
    }

    if (buttonId === 'confirm_yes') {
      const order = await createOrderFromSession(shopId, from, session);
      await deleteSession(session.id);

      if (!order) {
        const failText = '⚠️ Sorry, something went wrong placing your order. Please try again.';
        await sendWhatsAppMessage(from, failText);
        logMessage(shopId, from, 'outbound', 'system', 'text', failText);
        return;
      }

      // No shop notification here — the shopkeeper alert is
      // deliberately delayed 5 minutes (processDueNewOrderAlerts,
      // orderCreator.js + index.js) to give the customer this same
      // window to self-cancel via the button below without staff ever
      // seeing (and having to un-accept) an order that gets cancelled
      // moments later.
      const { body: placedText, buttons: placedButtons } = buildOrderPlacedPayload(order.order_number, order.id);
      await sendButtonMessage(from, placedText, placedButtons);
      logMessage(shopId, from, 'outbound', 'system', 'interactive', placedText);
    }
  }
}

// ── v2 architecture: webview entry points (Phase 2) ──────────────
// Ordering is moving to a customer webview (Phase 5), session-keyed
// rather than resolved from which WhatsApp number received the
// message — needed since one shared number now serves multiple shops.
// These three are the only ways a customer starts that new flow; none
// of them touch handleCustomerMessage below, which stays exactly as it
// was until the webview replaces it.

// Renders the shop's address as up to two lines ("line_1, line_2" then
// "city, state postal_code") for the welcome message — so a customer
// sees this as a real, locatable shop rather than a bare webview link.
// Any missing field is just omitted rather than leaving a stray comma
// or blank line; returns '' if there's no address on file at all.
function formatShopAddressLines(shop) {
  const line1 = [shop.address_line_1, shop.address_line_2].filter(Boolean).join(', ');
  const line2 = [
    [shop.city, shop.state].filter(Boolean).join(', '),
    shop.postal_code,
  ].filter(Boolean).join(' ');

  return [line1, line2].filter(Boolean).join('\n');
}

/**
 * Both new-session entry points below funnel through here: creates a
 * v2 order_sessions row and replies with the webview link. Fails
 * clearly (not a broken link) if WEBVIEW_BASE_URL isn't configured yet
 * — expected until Phase 5 actually ships the page.
 */
async function startCustomerOrderingSession(from, shop, name) {
  if (!config.webviewBaseUrl) {
    logger.warn({ shopId: shop.id }, 'WEBVIEW_BASE_URL not configured — cannot start an ordering session yet');
    await sendWhatsAppMessage(from, `Namaste ${name}! 👋 Online ordering for *${shop.name}* is launching soon — please check back shortly.`);
    return;
  }

  // "there" is handleIncomingMessage's fallback when WhatsApp didn't
  // supply a real contact profile name — never worth pre-filling the
  // webview's name field with that literal placeholder.
  const created = await createOrderSession(shop.id, from, { customerName: name === 'there' ? null : name });

  if (!created) {
    await sendWhatsAppMessage(from, '⚠️ Something went wrong starting your order. Please try again.');
    return;
  }

  const link = `${config.webviewBaseUrl}/shop/${shop.slug}?s=${created.token}`;

  const addressLines = formatShopAddressLines(shop);
  const displayPhone = await getShopDisplayPhone(shop.id);

  const detailLines = [
    addressLines ? `📍 ${addressLines.split('\n').join('\n')}` : null,
    displayPhone ? `📞 ${displayPhone}` : null,
  ].filter(Boolean).join('\n');

  const text =
    `Namaste ${name}! 👋 Welcome to *${shop.name}*.\n\n` +
    (detailLines ? `${detailLines}\n\n` : '') +
    `Tap below to browse and order (link expires in 30 min).`;

  await sendCtaUrlMessage(from, text, 'Order Now', link);
  logMessage(shop.id, from, 'outbound', 'system', 'interactive', text);
}

// Entry A: QR code pre-fills "SHOP-{slug}" as the message text.
async function handleShopSlugEntry(from, slug, name) {
  const shop = await findShopBySlug(slug);

  if (!shop) {
    // No shop_id to log against for an unresolvable slug — nothing to
    // attach this message to in the per-shop conversation log.
    await sendWhatsAppMessage(from, `⚠️ That shop link doesn't look right. Please rescan the QR code or ask the shop for a fresh one.`);
    return;
  }

  logMessage(shop.id, from, 'inbound', 'customer', 'text', `SHOP-${slug}`);
  await startCustomerOrderingSession(from, shop, name);
}

// Entry B: customer shares their location cold. Not logged to the
// per-shop conversation log — a location share doesn't belong to any
// one shop yet, and logMessage requires a shopId to attach to.
async function handleLocationShare(from, location, name) {
  const nearby = await findNearbyShops(location.latitude, location.longitude);

  if (nearby.length === 0) {
    await sendWhatsAppMessage(from, `😕 No Groovia shops found near you yet. Try scanning a shop's QR code instead.`);
    return;
  }

  // List messages cap at 10 rows total (same limit already handled for
  // the staff order-edit list) — cap at 9 nearby results.
  const rows = nearby.slice(0, 9).map((shop) => ({
    id: `nearby_shop_${shop.id}`,
    title: shop.name.slice(0, 24),
    description: `${Number(shop.distance_km).toFixed(1)} km away`.slice(0, 72),
  }));

  await sendListMessage(
    from,
    `📍 Found ${nearby.length} shop(s) near you. Tap one to start ordering:`,
    'Select shop',
    [{ title: 'Nearby shops', rows }]
  );
}

// Entry B, continued: customer picked a shop from the nearby-shops list.
async function handleNearbyShopPick(from, shopId, name) {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data: shop, error } = await supabase
    .from('shops')
    .select('id, name, slug, address_line_1, address_line_2, city, state, postal_code')
    .eq('id', shopId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error({ error, shopId }, 'Failed to load shop for nearby-shop pick');
  }

  if (!shop) {
    await sendWhatsAppMessage(from, `⚠️ That shop isn't available right now. Please share your location again.`);
    return;
  }

  logMessage(shop.id, from, 'inbound', 'customer', 'interactive', `Picked: ${shop.name}`);
  await startCustomerOrderingSession(from, shop, name);
}

// Customer-initiated cancel, within the 5-minute window enforced
// server-side by cancelOrderByCustomer (orderCreator.js) — never trust
// that the button simply not being tapped past 5 minutes is enough,
// since WhatsApp doesn't expire button messages on its own and a stale
// tap must still be rejected. No shopId param — cancelOrderByCustomer
// looks the order (and its shop_id) up itself from orderId alone, and
// this is now called before any shop resolution happens at all.
async function handleCustomerCancelRequest(from, orderId) {
  const { result, order } = await cancelOrderByCustomer(orderId, from);

  if (result === 'not_found') {
    // Deliberately the same message for "no such order" and "wrong
    // customer" — never confirms or denies that an order exists to a
    // phone it doesn't belong to.
    await sendWhatsAppMessage(from, `❌ Order not found.`);
    return;
  }

  if (result === 'already_processed') {
    const text = `⚠️ Order *${order.order_number}* is already being prepared and can no longer be cancelled here — please contact the shop directly.`;
    await sendWhatsAppMessage(from, text);
    logMessage(order.shop_id, from, 'outbound', 'system', 'text', text);
    return;
  }

  if (result === 'window_expired') {
    const text = `⚠️ The 5-minute cancellation window for order *${order.order_number}* has passed.`;
    await sendWhatsAppMessage(from, text);
    logMessage(order.shop_id, from, 'outbound', 'system', 'text', text);
    return;
  }

  if (result === 'db_unavailable') {
    await sendWhatsAppMessage(from, '⚠️ Something went wrong cancelling your order. Please try again.');
    return;
  }

  const text = `✅ Order *${order.order_number}* has been cancelled.`;
  await sendWhatsAppMessage(from, text);
  logMessage(order.shop_id, from, 'outbound', 'system', 'text', text);
}

async function handleCustomerMessage(from, message, shopId, name) {
  logInboundCustomerMessage(shopId, from, message);

  const session = await getSession(shopId, from);

  if (message.type === 'order' && message.order) {
    const { items, skipped } = await buildCartFromOrderMessage(shopId, message.order.product_items || []);

    if (items.length === 0) {
      const noneText = '😕 Sorry, none of those items are available right now.';
      await sendWhatsAppMessage(from, noneText);
      logMessage(shopId, from, 'outbound', 'system', 'text', noneText);
      return;
    }

    const total = cartTotal(items);
    const created = await createSession(shopId, from, {
      cartItems: items,
      cartTotal: total,
      customerName: name,
    });

    if (!created) {
      const wrongText = '⚠️ Something went wrong. Please try again.';
      await sendWhatsAppMessage(from, wrongText);
      logMessage(shopId, from, 'outbound', 'system', 'text', wrongText);
      return;
    }

    const skippedNote =
      skipped.length > 0
        ? `Note: ${skipped.length} item(s) in your cart weren't available and were left out.`
        : null;

    await sendSlotPrompt(shopId, from, total, skippedNote);
    return;
  }

  // cancel_order_ taps are now handled in handleIncomingMessage, before
  // this function is ever reached (see there for why) — nothing left to
  // check for that here.

  // Pickup-slot selection is a list message (business-hours-derived,
  // can exceed the 3-button cap), everything else in this flow is still
  // plain buttons — accept either shape here and hand the tapped id
  // through unchanged.
  if (
    message.type === 'interactive' &&
    (message.interactive?.type === 'button_reply' || message.interactive?.type === 'list_reply') &&
    session
  ) {
    const replyId = message.interactive.button_reply?.id || message.interactive.list_reply?.id;
    await handleSessionButtonReply(from, shopId, session, replyId);
    return;
  }

  if (session) {
    if (session.step === 'awaiting_slot') await sendSlotPrompt(shopId, from, session.cart_total);
    else if (session.step === 'awaiting_payment') await sendPaymentPrompt(shopId, from);
    else if (session.step === 'awaiting_confirm') await sendConfirmPrompt(shopId, from, session);
    return;
  }

  await sendGreeting(from, shopId, name);
}

// Best-effort summary of the inbound message for the owner-visible
// conversation log — item selection happens in WhatsApp's native
// Catalog+Cart, so a `type: 'order'` message has no single text body.
function logInboundCustomerMessage(shopId, from, message) {
  // whatsapp_messages.message_type has a narrow check constraint (verified
  // live: text/image/interactive pass, catalog/button/order/list don't) —
  // map WhatsApp's own message.type down to one of those rather than pass
  // it straight through.
  let content = `[${message.type}]`;
  let loggedType = 'text';
  const externalId = message.id;

  if (message.type === 'text') {
    content = message.text?.body || content;
    loggedType = 'text';
  } else if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    content = message.interactive.button_reply.title || message.interactive.button_reply.id;
    loggedType = 'interactive';
  } else if (message.type === 'order' && message.order) {
    const itemCount = message.order.product_items?.length || 0;
    content = `[Order submitted] ${itemCount} item(s)`;
    loggedType = 'text';
  }

  logMessage(shopId, from, 'inbound', 'customer', loggedType, content, externalId);
}

// ── Main webhook handler ───────────────────────────────────────
async function handleWebhookPayload(payload) {
  try {
    if (payload.object !== 'whatsapp_business_account') return;

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        for (const message of value.messages || []) {
          if (processedMessages.has(message.id)) {
            logger.info({ id: message.id }, 'Duplicate skipped');
            continue;
          }
          markProcessed(message.id);
          await handleIncomingMessage(message, value);
        }

        for (const status of value.statuses || []) {
          await handleStatusUpdate(status);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Webhook processing error');
  }
}

// One-time onboarding message for a staff member's first-ever contact
// with the bot — plain text, not a template, since them messaging first
// is exactly what opens the 24h customer-service window; there's no
// need for (or way to justify) a business-initiated template here.
// whatsapp_welcomed_at gates this to once per shop_user, checked by the
// caller before any command parsing runs.
function buildStaffWelcomeMessage() {
  const dashboardLine = config.dashboardUrl || '(ask your admin for the dashboard link)';

  return (
    `Welcome to Groovia! 🛒\n\n` +
    `New orders will appear here with one-tap buttons\n` +
    `to Accept, Reject, or Edit.\n\n` +
    `For full order management:\n${dashboardLine}\n\n` +
    `Tip: Pin this chat so you never miss an order.`
  );
}

async function sendStaffWelcomeMessage(from, shopId, staffUserId) {
  const text = buildStaffWelcomeMessage();
  await sendWhatsAppMessage(from, text);
  logMessage(shopId, from, 'outbound', 'system', 'text', text);

  const supabase = getSupabase();
  if (supabase) {
    await supabase.from('shop_users').update({ whatsapp_welcomed_at: new Date().toISOString() }).eq('id', staffUserId);
  }
}

// Staff command handling — unchanged behavior, just receives shopId
// from the global staff match now instead of deriving it from
// phone_number_id (see handleIncomingMessage for why).
async function handleStaffMessage(message, value, staffMatch) {
  const from    = message.from;
  const type    = message.type;
  const shopId  = staffMatch.shopId;
  const contact = value.contacts?.[0];
  const name    = contact?.profile?.name || 'there';

  // First-ever contact from this staff member — send the welcome as a
  // bonus first message, but do NOT return: a staff member's first-ever
  // interaction is just as likely to be tapping Accept/Reject/Edit on a
  // real order (arriving as their first message ever) as it is to be a
  // plain "Hi". Returning here used to silently swallow that tap
  // entirely — confirmed in production: an Edit tap on a real order was
  // replaced with only the welcome text (which even mentions a
  // dashboard link), and the actual edit action was lost, never
  // retried. Falling through means both happen: the welcome, then
  // whatever they actually sent gets processed normally right after.
  if (!staffMatch.whatsappWelcomedAt) {
    await sendStaffWelcomeMessage(from, shopId, staffMatch.id);
  }

  if (type === 'interactive' && message.interactive?.type === 'button_reply') {
    await handleStaffButtonReply(from, shopId, staffMatch, message.interactive.button_reply.id);
    return;
  }

  // A tap on a quick-reply button that came from an approved TEMPLATE
  // message (the new_order_alert fallback) arrives with a different
  // shape than a live interactive button — type: 'button' with the
  // payload directly on message.button.payload, not nested under
  // interactive.button_reply. Same accept_/reject_/edit_<orderId>
  // payload format either way, so it routes through the same handler.
  if (type === 'button' && message.button?.payload) {
    await handleStaffButtonReply(from, shopId, staffMatch, message.button.payload);
    return;
  }

  if (type !== 'text') {
    await sendWhatsAppMessage(from,
      `Hi ${name}! 👋 I only understand text commands right now.\nReply *HELP* to see what I can do.`
    );
    return;
  }

  const text   = message.text?.body?.trim() || '';
  const parsed = parseCommand(text);

  logger.info({ text, parsed, shopId, role: staffMatch.role }, 'Text message received');

  if (!parsed) {
    await sendWhatsAppMessage(from,
      `Hi ${name}! 👋 I didn't understand that.\n\n` +
      `Here are the commands I know:\n\n` +
      `*ACCEPT ORD-XXXX* — Accept an order\n` +
      `*REJECT ORD-XXXX reason* — Reject with reason\n` +
      `*READY ORD-XXXX* — Mark ready for pickup\n` +
      `*COMPLETE ORD-XXXX* — Mark completed\n` +
      `*CATALOG* — Add or edit products\n` +
      `*HELP* — Show this menu\n\n` +
      `_Groovia_ 🛒`
    );
    return;
  }

  if (parsed.command === 'HELP') {
    await sendWhatsAppMessage(from,
      `*Groovia Commands* 📦\n\n` +
      `*ACCEPT ORD-XXXX*\nAccept a pending order\n\n` +
      `*REJECT ORD-XXXX [reason]*\nReject with optional reason\n\n` +
      `*READY ORD-XXXX*\nMark order ready for pickup\n\n` +
      `*COMPLETE ORD-XXXX*\nMark as completed\n\n` +
      `*CATALOG*\nAdd or edit products\n\n` +
      `_Need help? admin@groovia.co.in_`
    );
    return;
  }

  if (parsed.command === 'CATALOG') {
    await sendCatalogLinkMessage(from, shopId);
    return;
  }

  await handleOrderCommand(from, parsed, shopId, staffMatch);
}

async function handleIncomingMessage(message, value) {
  const from    = message.from;
  const type    = message.type;
  const contact = value.contacts?.[0];
  const name    = contact?.profile?.name || 'there';

  logger.info({ from, type, id: message.id, name }, '📩 Incoming message');

  // Order-scoped, not shop-routing-scoped — a cancel_order_<id> button
  // carries everything cancelOrderByCustomer needs (the order id; it
  // looks up shop_id itself and validates the tapping phone against the
  // order's own customer_phone_snapshot), so this is checked before any
  // staff/shop resolution rather than being buried inside the old
  // native-catalog customer handler below it used to live in. This is
  // the same button both the native-catalog flow AND the v2 webview's
  // order-placement confirmation send — it has to work regardless of
  // which flow placed the order or who's tapping it (cancelOrderByCustomer's
  // own phone check is what actually authorizes this, not where in the
  // router it's reached from).
  if (type === 'interactive' && message.interactive?.type === 'button_reply') {
    const cancelMatch = /^cancel_order_(.+)$/.exec(message.interactive.button_reply.id || '');
    if (cancelMatch) {
      await handleCustomerCancelRequest(from, cancelMatch[1]);
      return;
    }
  }

  // ── v2 entry points, checked BEFORE staff-priority ──────────────
  // A QR scan ("SHOP-{slug}"), a shared location, or picking from the
  // resulting nearby-shops list is an unambiguous, deliberate signal —
  // "I want to order here as a customer" — unlike a bare text message,
  // which genuinely could be a staff command. That distinction is what
  // lets these three bypass staff-priority without reopening the
  // "shop_user misrouted into a customer flow" problem staff-priority
  // exists to prevent: a staff member for Shop A who scans Shop B's QR
  // (or their own shop's, from the dashboard Settings page) clearly
  // means to order as a customer right now, at that specific shop, not
  // to issue a staff command that happens to look like one of these.
  // Plain text/buttons from a staff phone still always resolve to staff
  // below — only these three explicit shapes get this exception.
  if (type === 'text') {
    const slugMatch = /^SHOP-([a-z0-9-]+)$/i.exec(message.text?.body?.trim() || '');
    if (slugMatch) {
      await handleShopSlugEntry(from, slugMatch[1], name);
      return;
    }
  }

  if (type === 'location' && message.location) {
    await handleLocationShare(from, message.location, name);
    return;
  }

  if (type === 'interactive' && message.interactive?.type === 'list_reply') {
    const nearbyMatch = /^nearby_shop_(.+)$/.exec(message.interactive.list_reply.id || '');
    if (nearbyMatch) {
      await handleNearbyShopPick(from, nearbyMatch[1], name);
      return;
    }
  }

  // Staff identity is resolved globally now, not derived from which
  // WhatsApp number received the message — one shared number now
  // serves multiple shops (v2 architecture), so phone_number_id no
  // longer maps to a single shop the way it used to. Staff-ness takes
  // priority over everything below (plain text, other button/list taps,
  // the same-number-shares-the-number fallback), even if this same
  // phone happens to have an unrelated ordering session open at some
  // other shop — a shop_user must never be routed into a customer flow
  // from an ambiguous message. The three explicit entry points above
  // are the deliberate exception to that rule, not a hole in it.
  const staffMatch = await resolveShopUserGlobal(from);

  if (staffMatch) {
    await handleStaffMessage(message, value, staffMatch);
    return;
  }

  // Fallback: a customer who didn't arrive via a QR scan or shared
  // location — still the common case, since most people just message
  // the number directly — resolves to a shop the same way the pre-v2
  // bot always did, but now starts a v2 webview session instead of
  // routing into the old native-catalog flow (handleCustomerMessage,
  // below — now unreachable from here, kept for now rather than deleted
  // immediately; see the PR this shipped in for the cleanup list).
  //
  // Same ambiguity caveat Phase 2 originally flagged: this still
  // assumes phone_number_id maps to exactly one shop. That breaks once
  // a second shop genuinely shares the number — at that point this
  // needs to become an explicit "share your location or scan a shop QR"
  // prompt instead of guessing which shop a bare "Hi" was meant for.
  const phoneNumberId = value.metadata?.phone_number_id;
  const shop = await resolveShopByPhoneNumberId(phoneNumberId);

  if (!shop) {
    logger.error({ phoneNumberId }, 'No shop linked to this WhatsApp number');
    await sendWhatsAppMessage(from, '⚠️ This number isn\'t linked to a shop yet. Please contact support.');
    return;
  }

  await startCustomerOrderingSession(from, shop, name);
}

async function handleStatusUpdate(status) {
  // Meta's status webhook includes an `errors` array on failed deliveries
  // (e.g. code 131047 — "more than 24 hours have passed since the
  // recipient last replied", the exact reason a non-template message to
  // an inactive-session recipient silently fails after being accepted by
  // the send API). Logging as info-only with no error detail is exactly
  // what made this invisible before.
  if (status.status === 'failed') {
    const err = status.errors?.[0] || {};
    logger.error(
      {
        id: status.id,
        recipient: status.recipient_id,
        code: err.code,
        title: err.title,
        message: err.message,
        details: err.error_data?.details,
      },
      '📊 Status: failed'
    );

    // Only tracked sends (currently just new-order alerts) have a
    // delivery row to correlate against — most status updates (customer
    // replies, staff's own direct replies) have none, and that's fine,
    // nothing further to do for those.
    const delivery = await deliveryTracker.findByWamid(status.id);
    if (!delivery) return;

    if (deliveryTracker.isWindowExpired(err.code)) {
      // Retrying this exact message can never succeed — the only real
      // fix is a template send, attempted immediately rather than
      // waiting on the retry loop.
      await deliveryTracker.recordFailure(delivery.id, err, delivery.attempt_count);
      if (delivery.purpose === 'new_order_alert') {
        await sendNewOrderAlertTemplateFallback(delivery);
      }
      return;
    }

    // Genuinely transient — hand to the normal backoff/retry path.
    await deliveryTracker.recordFailure(delivery.id, err, delivery.attempt_count);
    return;
  }

  if (status.status === 'delivered' || status.status === 'read') {
    await deliveryTracker.markDeliveredByWamid(status.id);
  }

  logger.info({
    id:        status.id,
    status:    status.status,
    recipient: status.recipient_id,
  }, `📊 Status: ${status.status}`);
}

module.exports = { handleWebhookPayload, sendWhatsAppMessage };
