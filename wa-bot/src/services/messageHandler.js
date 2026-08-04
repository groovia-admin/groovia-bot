const logger = require('../utils/logger');
const {
  getSupabase,
  resolveShopByPhoneNumberId,
  resolveShopUserByPhone,
} = require('./shopResolver');
const { sendWhatsAppMessage, sendCatalogMessage, sendButtonMessage } = require('./whatsappClient');
const { notifyCustomer } = require('./customerNotifier');
const { getSession, createSession, updateSession, deleteSession } = require('./sessionStore');
const {
  buildCartFromOrderMessage,
  cartTotal,
  createOrderFromSession,
  notifyShopOfNewOrder,
} = require('./orderCreator');

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

  // Write audit log
  // NOTE: not adding a changed_by_shop_user column here yet — this table
  // isn't in the typed schema anywhere in the repo, so its real columns
  // aren't verifiable from code. Confirm the schema before extending this
  // insert; shopUser.id/fullName are available in scope when that's ready.
  await supabase.from('order_status_logs').insert({
    order_id:    order.id,
    status_from: order.status,
    status_to:   transition.to,
    changed_via: 'whatsapp',
    notes:       reason || null,
  }).catch(() => {});

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
// Button ids are "<accept|reject|ready|complete>_<orderId>" — the order is
// identified by its own id, not typed, so there's nothing to get wrong.
const STAFF_BUTTON_COMMANDS = {
  accept: 'ACCEPT',
  reject: 'REJECT',
  ready: 'READY',
  complete: 'COMPLETE',
};

async function handleStaffButtonReply(from, shopId, shopUser, buttonId) {
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

  if (supabase) {
    const { data: shop } = await supabase.from('shops').select('name').eq('id', shopId).maybeSingle();
    if (shop?.name) shopName = shop.name;
  }

  await sendCatalogMessage(
    from,
    `Namaste ${name}! 👋 Welcome to *${shopName}*.\n\nTap below to browse and order.`
  );
}

async function sendSlotPrompt(from, total) {
  await sendWhatsAppMessage(from, `🛒 *Cart total: ₹${total.toFixed(2)}*\n\n⏰ When would you like to pick up?`);
  await sendButtonMessage(
    from,
    'Choose a pickup slot:',
    PICKUP_SLOTS.map((s) => ({ id: s.id, title: s.label }))
  );
}

async function sendPaymentPrompt(from) {
  await sendButtonMessage(
    from,
    '💳 Payment method:',
    PAYMENT_OPTIONS.map((p) => ({ id: p.id, title: p.label }))
  );
}

async function sendConfirmPrompt(from, session) {
  const itemLines = session.cart_items
    .map((i) => `${i.name} × ${i.quantity} — ₹${i.subtotal.toFixed(2)}`)
    .join('\n');
  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.value === session.payment_method)?.label || session.payment_method;

  const text =
    `📋 *Confirm your order*\n\n${itemLines}\n\n` +
    `Total: ₹${session.cart_total.toFixed(2)}\n` +
    `⏰ Pickup: ${session.pickup_slot_label}\n` +
    `💵 Payment: ${paymentLabel}`;

  await sendWhatsAppMessage(from, text);
  await sendButtonMessage(from, 'Confirm?', [
    { id: 'confirm_yes', title: '✅ Place order' },
    { id: 'confirm_no', title: '❌ Cancel' },
  ]);
}

async function handleSessionButtonReply(from, shopId, session, buttonId) {
  if (session.step === 'awaiting_slot') {
    const slot = PICKUP_SLOTS.find((s) => s.id === buttonId);
    if (!slot) {
      await sendSlotPrompt(from, session.cart_total);
      return;
    }
    await updateSession(session.id, { step: 'awaiting_payment', pickup_slot_label: slot.label });
    await sendPaymentPrompt(from);
    return;
  }

  if (session.step === 'awaiting_payment') {
    const option = PAYMENT_OPTIONS.find((p) => p.id === buttonId);
    if (!option) {
      await sendPaymentPrompt(from);
      return;
    }
    const updated = await updateSession(session.id, { step: 'awaiting_confirm', payment_method: option.value });
    await sendConfirmPrompt(from, updated);
    return;
  }

  if (session.step === 'awaiting_confirm') {
    if (buttonId === 'confirm_no') {
      await deleteSession(session.id);
      await sendWhatsAppMessage(from, 'Order cancelled. Message *Hi* anytime to start again.');
      return;
    }

    if (buttonId === 'confirm_yes') {
      const order = await createOrderFromSession(shopId, from, session);
      await deleteSession(session.id);

      if (!order) {
        await sendWhatsAppMessage(from, '⚠️ Sorry, something went wrong placing your order. Please try again.');
        return;
      }

      await sendWhatsAppMessage(
        from,
        `✅ *Order ${order.order_number} placed!*\n\nWaiting for the shop to confirm — we'll message you.`
      );

      try {
        await notifyShopOfNewOrder(shopId, order, session);
      } catch (err) {
        logger.error({ err, orderId: order.id }, 'Failed to notify shop of new order');
      }
    }
  }
}

async function handleCustomerMessage(from, message, shopId, name) {
  const session = await getSession(shopId, from);

  if (message.type === 'order' && message.order) {
    const { items, skipped } = await buildCartFromOrderMessage(shopId, message.order.product_items || []);

    if (items.length === 0) {
      await sendWhatsAppMessage(from, '😕 Sorry, none of those items are available right now.');
      return;
    }

    const total = cartTotal(items);
    const created = await createSession(shopId, from, {
      cartItems: items,
      cartTotal: total,
      customerName: name,
    });

    if (!created) {
      await sendWhatsAppMessage(from, '⚠️ Something went wrong. Please try again.');
      return;
    }

    if (skipped.length > 0) {
      await sendWhatsAppMessage(
        from,
        `Note: ${skipped.length} item(s) in your cart weren't available and were left out.`
      );
    }

    await sendSlotPrompt(from, total);
    return;
  }

  if (message.type === 'interactive' && message.interactive?.type === 'button_reply' && session) {
    await handleSessionButtonReply(from, shopId, session, message.interactive.button_reply.id);
    return;
  }

  if (session) {
    if (session.step === 'awaiting_slot') await sendSlotPrompt(from, session.cart_total);
    else if (session.step === 'awaiting_payment') await sendPaymentPrompt(from);
    else if (session.step === 'awaiting_confirm') await sendConfirmPrompt(from, session);
    return;
  }

  await sendGreeting(from, shopId, name);
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
          handleStatusUpdate(status);
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

function handleStatusUpdate(status) {
  logger.info({
    id:        status.id,
    status:    status.status,
    recipient: status.recipient_id,
  }, `📊 Status: ${status.status}`);
}

module.exports = { handleWebhookPayload, sendWhatsAppMessage };
