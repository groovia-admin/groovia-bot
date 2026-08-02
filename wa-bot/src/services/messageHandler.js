const logger = require('../utils/logger');
const {
  getSupabase,
  resolveShopByPhoneNumberId,
  resolveShopUserByPhone,
} = require('./shopResolver');
const { sendWhatsAppMessage } = require('./whatsappClient');
const { notifyCustomer } = require('./customerNotifier');

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

// ── Order command handler ──────────────────────────────────────
async function handleOrderCommand(from, parsed, shopId, shopUser) {
  const supabase = getSupabase();

  if (!supabase) {
    await sendWhatsAppMessage(from, '⚠️ System error. Please try again later.');
    return;
  }

  const { command, orderNumber, reason } = parsed;

  // Find order — scoped to the sender's resolved shop, so a spoofed or
  // guessed order number belonging to a different shop can never match.
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, shop_id')
    .eq('order_number', orderNumber)
    .eq('shop_id', shopId)
    .single();

  if (error || !order) {
    await sendWhatsAppMessage(from,
      `❌ Order *${orderNumber}* not found.\nPlease check the order number and try again.`
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
      `⚠️ Cannot ${command.toLowerCase()} order *${orderNumber}*.\n` +
      `Current status: *${order.status.toUpperCase()}*\n` +
      `Order must be *${transition.from.toUpperCase()}* to use this command.`
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
    logger.error({ updateError, orderNumber }, 'Order update failed');
    await sendWhatsAppMessage(from, `❌ Failed to update order *${orderNumber}*. Please try again.`);
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
    await notifyCustomer(order.id, transition.to);
  } catch (err) {
    logger.error({ err, orderNumber, command }, 'Customer notify failed');
  }

  // Confirm to shopkeeper
  const replies = {
    ACCEPT:   `✅ Order *${orderNumber}* accepted!\nCustomer will be notified.`,
    REJECT:   `❌ Order *${orderNumber}* rejected.\nReason: ${reason}\nCustomer will be notified.`,
    READY:    `🎉 Order *${orderNumber}* is ready for pickup!\nCustomer will be notified.`,
    COMPLETE: `✔️ Order *${orderNumber}* completed. Well done!`,
  };

  await sendWhatsAppMessage(from, replies[command]);
  logger.info({ orderNumber, from: order.status, to: transition.to }, 'Order updated via WhatsApp');
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
  // received it) and verify the sender is a recognized, active member of
  // that shop — before doing anything else. There's no customer-facing
  // flow in this bot; every sender must be staff of the receiving shop.
  const phoneNumberId = value.metadata?.phone_number_id;
  const shopId = await resolveShopByPhoneNumberId(phoneNumberId);

  if (!shopId) {
    logger.error({ phoneNumberId }, 'No shop linked to this WhatsApp number');
    await sendWhatsAppMessage(from, '⚠️ This number isn\'t linked to a shop yet. Please contact support.');
    return;
  }

  const shopUser = await resolveShopUserByPhone(shopId, from);

  if (!shopUser) {
    await sendWhatsAppMessage(from,
      `Hi ${name}! You're not registered as staff for this shop.\nContact your shop owner to be added.`
    );
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
