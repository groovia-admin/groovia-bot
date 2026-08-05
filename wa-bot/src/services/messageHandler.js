const logger = require('../utils/logger');
const {
  getSupabase,
  resolveShopByPhoneNumberId,
  resolveShopUserByPhone,
} = require('./shopResolver');
const { sendWhatsAppMessage, sendCatalogMessage, sendButtonMessage, sendListMessage } = require('./whatsappClient');
const { notifyCustomer } = require('./customerNotifier');
const { logMessage } = require('./conversationLogger');
const { getSession, createSession, updateSession, deleteSession } = require('./sessionStore');
const {
  buildCartFromOrderMessage,
  cartTotal,
  createOrderFromSession,
  notifyShopOfNewOrder,
  sendNewOrderAlertTemplateFallback,
} = require('./orderCreator');
const {
  getEditSession,
  startEditSession,
  endEditSession,
  getOrderWithItems,
  formatItemList,
  removeItems,
} = require('./orderEditor');
const deliveryTracker = require('./deliveryTracker');

// Static for now — the demo's "recommended based on time of day" logic is
// a deliberate scope cut for the core loop.
const PICKUP_SLOTS = [
  { id: 'slot_1', label: '6:00–6:30 PM' },
  { id: 'slot_2', label: '6:30–7:00 PM' },
  { id: 'slot_3', label: '7:00–7:30 PM' },
];

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

  // Clear any lingering edit session — e.g. staff tapped Accept/Reject
  // straight from the button message instead of typing "done" first.
  // Harmless no-op if none exists; without this a stale session would
  // hijack the next unrelated text message as if it were edit input.
  await endEditSession(shopId, from);

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

// Re-sent after every edit (an item removed, or "done") so staff always
// see the current total and can Accept/Reject/keep Editing — same three
// actions offered on the original new-order notification.
async function sendOrderActionButtons(from, order, items) {
  const body =
    `📋 *Order ${order.order_number}* — ₹${Number(order.total_amount).toFixed(2)}\n\n` +
    `Items:\n${formatItemList(items)}`;

  await sendButtonMessage(from, body, [
    { id: `accept_${order.id}`, title: '✅ Accept' },
    { id: `reject_${order.id}`, title: '❌ Reject' },
    { id: `edit_${order.id}`, title: '✏️ Edit' },
  ]);
}

// WhatsApp list messages cap at 10 rows total — one is reserved for the
// "Done" row, so at most 9 items can be listed. Orders bigger than that
// fall back to the reply-with-a-number flow, which has no such limit.
const MAX_EDIT_LIST_ITEMS = 9;

function buildEditListSections(order, items) {
  const rows = items.map((item) => ({
    id: `remove_${item.id}`,
    title: item.product_name_snapshot.slice(0, 24),
    description: `Qty ${item.quantity} — ₹${Number(item.subtotal).toFixed(2)}`.slice(0, 72),
  }));

  rows.push({
    id: `edit_done_${order.id}`,
    title: '✅ Done',
    description: 'Keep the rest, back to Accept/Reject',
  });

  return [{ title: 'Order items', rows }];
}

async function sendEditListPrompt(from, order, items) {
  const body =
    `✏️ *Editing ${order.order_number}*\n\n` +
    `Total: ₹${Number(order.total_amount).toFixed(2)}\n\n` +
    `Tap an item to remove it, or "Done" to keep the rest.`;

  await sendListMessage(from, body, 'Select item', buildEditListSections(order, items));
}

async function sendEditPrompt(from, shopId, orderId) {
  const loaded = await getOrderWithItems(orderId, shopId);
  if (!loaded) {
    await sendWhatsAppMessage(from, '❌ Order not found.');
    return;
  }

  if (loaded.order.status !== 'pending') {
    await sendWhatsAppMessage(from, `⚠️ Order *${loaded.order.order_number}* can no longer be edited (already ${loaded.order.status}).`);
    return;
  }

  const started = await startEditSession(shopId, from, orderId);
  if (!started) {
    await sendWhatsAppMessage(from, '⚠️ Could not start editing right now. Please try again, or Accept/Reject as-is.');
    return;
  }

  if (loaded.items.length > MAX_EDIT_LIST_ITEMS) {
    await sendWhatsAppMessage(from,
      `✏️ *Editing ${loaded.order.order_number}*\n\n${formatItemList(loaded.items)}\n\n` +
      `Reply with the item number(s) to remove (e.g. "2" or "1,3"), or type *done* when finished.`
    );
    return;
  }

  await sendEditListPrompt(from, loaded.order, loaded.items);
}

// ── Staff list-tap handler (the edit flow's "remove one item" UI) ────
// Only reached while a staff_order_edits row exists — mirrors
// handleStaffEditReply's text-based equivalent, which stays in place
// both as the >9-item fallback and as a safety net if someone types
// instead of tapping.
async function handleStaffListReply(from, shopId, listReplyId) {
  const editSession = await getEditSession(shopId, from);
  if (!editSession) return;

  const doneMatch = /^edit_done_(.+)$/.exec(listReplyId || '');
  if (doneMatch) {
    await endEditSession(shopId, from);
    const loaded = await getOrderWithItems(editSession.order_id, shopId);
    if (loaded) await sendOrderActionButtons(from, loaded.order, loaded.items);
    return;
  }

  const removeMatch = /^remove_(.+)$/.exec(listReplyId || '');
  if (!removeMatch) return;

  const result = await removeItems(editSession.order_id, [removeMatch[1]]);

  if (!result) {
    await sendWhatsAppMessage(from, '⚠️ Something went wrong removing that. Please try again.');
    return;
  }

  if (result.blocked) {
    await sendWhatsAppMessage(from,
      `⚠️ Can't remove every item — an order needs at least one. Use *Reject* instead if none of these are available.`
    );
    return;
  }

  const loaded = await getOrderWithItems(editSession.order_id, shopId);
  if (!loaded) {
    await endEditSession(shopId, from);
    await sendWhatsAppMessage(from, '❌ Order not found. Edit cancelled.');
    return;
  }

  await sendEditListPrompt(from, loaded.order, loaded.items);
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

// ── Staff order-edit reply handler ────────────────────────────────
// Only reached while a staff_order_edits row exists for this phone —
// see handleIncomingMessage, which checks for one before falling through
// to the normal ACCEPT/REJECT/... command parser.
async function handleStaffEditReply(from, shopId, editSession, text) {
  const loaded = await getOrderWithItems(editSession.order_id, shopId);
  if (!loaded) {
    await endEditSession(shopId, from);
    await sendWhatsAppMessage(from, '❌ Order not found. Edit cancelled.');
    return;
  }

  const trimmed = (text || '').trim().toLowerCase();

  if (trimmed === 'done') {
    await endEditSession(shopId, from);
    await sendOrderActionButtons(from, loaded.order, loaded.items);
    return;
  }

  // Parse "2" / "1,3" / "1, 3, 4" into 1-based item numbers.
  const numbers = trimmed
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= loaded.items.length);

  if (numbers.length === 0) {
    await sendWhatsAppMessage(from,
      `Didn't catch that. Reply with the item number(s) to remove (e.g. "2" or "1,3"), or type *done*.`
    );
    return;
  }

  const itemIdsToRemove = numbers.map((n) => loaded.items[n - 1].id);
  const result = await removeItems(editSession.order_id, itemIdsToRemove);

  if (!result) {
    await sendWhatsAppMessage(from, '⚠️ Something went wrong removing that. Please try again.');
    return;
  }

  if (result.blocked) {
    await sendWhatsAppMessage(from,
      `⚠️ Can't remove every item — an order needs at least one. Use *Reject* instead if none of these are available.`
    );
    return;
  }

  const updated = await getOrderWithItems(editSession.order_id, shopId);
  await sendWhatsAppMessage(from,
    `Removed. New total: ₹${result.total.toFixed(2)}\n\n${formatItemList(updated.items)}\n\n` +
    `Reply with more item number(s) to remove, or type *done* when finished.`
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
  const body =
    (note ? `${note}\n\n` : '') +
    `🛒 *Cart total: ₹${total.toFixed(2)}*\n\n⏰ When would you like to pick up?`;

  await sendButtonMessage(
    from,
    body,
    PICKUP_SLOTS.map((s) => ({ id: s.id, title: s.label }))
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

  await sendButtonMessage(from, text, [
    { id: 'confirm_yes', title: '✅ Place order' },
    { id: 'confirm_no', title: '❌ Cancel' },
  ]);
  logMessage(shopId, from, 'outbound', 'system', 'interactive', text);
}

async function handleSessionButtonReply(from, shopId, session, buttonId) {
  if (session.step === 'awaiting_slot') {
    const slot = PICKUP_SLOTS.find((s) => s.id === buttonId);
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

      const placedText = `✅ *Order ${order.order_number} placed!*\n\nWaiting for the shop to confirm — we'll message you.`;
      await sendWhatsAppMessage(from, placedText);
      logMessage(shopId, from, 'outbound', 'system', 'text', placedText);

      try {
        await notifyShopOfNewOrder(shopId, order, session);
      } catch (err) {
        logger.error({ err, orderId: order.id }, 'Failed to notify shop of new order');
      }
    }
  }
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

  if (message.type === 'interactive' && message.interactive?.type === 'button_reply' && session) {
    await handleSessionButtonReply(from, shopId, session, message.interactive.button_reply.id);
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

async function handleIncomingMessage(message, value) {
  const from    = message.from;
  const type    = message.type;
  const contact = value.contacts?.[0];
  const name    = contact?.profile?.name || 'there';

  logger.info({ from, type, id: message.id, name }, '📩 Incoming message');

  // Resolve which shop this message belongs to (via the WABA number that
  // received it) before doing anything else.
  const phoneNumberId = value.metadata?.phone_number_id;
  const shopId = await resolveShopByPhoneNumberId(phoneNumberId);

  if (!shopId) {
    logger.error({ phoneNumberId }, 'No shop linked to this WhatsApp number');
    await sendWhatsAppMessage(from, '⚠️ This number isn\'t linked to a shop yet. Please contact support.');
    return;
  }

  const shopUser = await resolveShopUserByPhone(shopId, from);

  // Not a recognized staff member of this shop -> treat as a customer,
  // not a rejection. Staff (owner/manager/staff, any role) keep the
  // command flow below; everyone else gets the ordering conversation.
  if (!shopUser) {
    await handleCustomerMessage(from, message, shopId, name);
    return;
  }

  if (type === 'interactive' && message.interactive?.type === 'button_reply') {
    await handleStaffButtonReply(from, shopId, shopUser, message.interactive.button_reply.id);
    return;
  }

  // A tap on a quick-reply button that came from an approved TEMPLATE
  // message (the new_order_alert fallback) arrives with a different
  // shape than a live interactive button — type: 'button' with the
  // payload directly on message.button.payload, not nested under
  // interactive.button_reply. Same accept_/reject_/edit_<orderId>
  // payload format either way, so it routes through the same handler.
  if (type === 'button' && message.button?.payload) {
    await handleStaffButtonReply(from, shopId, shopUser, message.button.payload);
    return;
  }

  if (type === 'interactive' && message.interactive?.type === 'list_reply') {
    await handleStaffListReply(from, shopId, message.interactive.list_reply.id);
    return;
  }

  // If this staff member is mid-edit on an order, any text reply is
  // interpreted as edit input (item numbers / "done"), not a command —
  // must be checked before the command parser below.
  if (type === 'text') {
    const editSession = await getEditSession(shopId, from);
    if (editSession) {
      await handleStaffEditReply(from, shopId, editSession, message.text?.body || '');
      return;
    }
  }

  if (type !== 'text') {
    await sendWhatsAppMessage(from,
      `Hi ${name}! 👋 I only understand text commands right now.\nReply *HELP* to see what I can do.`
    );
    return;
  }

  const text   = message.text?.body?.trim() || '';
  const parsed = parseCommand(text);

  logger.info({ text, parsed, shopId, role: shopUser.role }, 'Text message received');

  if (!parsed) {
    await sendWhatsAppMessage(from,
      `Hi ${name}! 👋 I didn't understand that.\n\n` +
      `Here are the commands I know:\n\n` +
      `*ACCEPT ORD-XXXX* — Accept an order\n` +
      `*REJECT ORD-XXXX reason* — Reject with reason\n` +
      `*READY ORD-XXXX* — Mark ready for pickup\n` +
      `*COMPLETE ORD-XXXX* — Mark completed\n` +
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
      `_Need help? admin@groovia.co.in_`
    );
    return;
  }

  await handleOrderCommand(from, parsed, shopId, shopUser);
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
