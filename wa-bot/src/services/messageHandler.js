const logger = require('../utils/logger');

// ── Deduplication ──────────────────────────────────────────────
const processedMessages = new Set();
const DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function markProcessed(id) {
  processedMessages.add(id);
  setTimeout(() => processedMessages.delete(id), DEDUP_TTL_MS).unref();
}

// ── WhatsApp sender ────────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v23.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logger.error({ to, error: data }, '❌ WhatsApp send failed');
      return false;
    }

    logger.info({ to, messageId: data.messages?.[0]?.id }, '✅ WhatsApp message sent');
    return true;
  } catch (err) {
    logger.error({ err, to }, '❌ WhatsApp send error');
    return false;
  }
}

// ── Command parser ─────────────────────────────────────────────
// Parses shopkeeper replies like:
//   ACCEPT ORD-20250801-1001
//   REJECT ORD-20250801-1001 Out of stock
//   READY ORD-20250801-1001
function parseCommand(text) {
  if (!text) return null;
  const upper = text.trim().toUpperCase();

  // ACCEPT <order_number>
  const acceptMatch = upper.match(/^ACCEPT\s+(ORD-[\w-]+)$/i);
  if (acceptMatch) return { command: 'ACCEPT', orderNumber: acceptMatch[1].toUpperCase() };

  // REJECT <order_number> [reason]
  const rejectMatch = text.trim().match(/^REJECT\s+(ORD-[\w-]+)(?:\s+(.+))?$/i);
  if (rejectMatch) return { command: 'REJECT', orderNumber: rejectMatch[1].toUpperCase(), reason: rejectMatch[2] || 'Rejected by shopkeeper' };

  // READY <order_number>
  const readyMatch = upper.match(/^READY\s+(ORD-[\w-]+)$/i);
  if (readyMatch) return { command: 'READY', orderNumber: readyMatch[1].toUpperCase() };

  // COMPLETE / DONE <order_number>
  const completeMatch = upper.match(/^(?:COMPLETE|DONE)\s+(ORD-[\w-]+)$/i);
  if (completeMatch) return { command: 'COMPLETE', orderNumber: completeMatch[1].toUpperCase() };

  // HELP
  if (upper === 'HELP' || upper === 'HI' || upper === 'HELLO') return { command: 'HELP' };

  return null;
}

// ── Supabase client (lazy init) ────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  try {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  } catch (err) {
    logger.warn('Supabase not configured — order commands will not work');
  }
  return _supabase;
}

// ── Order command handlers ─────────────────────────────────────
async function handleOrderCommand(from, parsed) {
  const supabase = getSupabase();

  if (!supabase) {
    await sendWhatsAppMessage(from, '⚠️ System error. Please try again later.');
    return;
  }

  const { command, orderNumber, reason } = parsed;

  // Find order
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, status, total_amount, shop_id')
    .eq('order_number', orderNumber)
    .single();

  if (error || !order) {
    await sendWhatsAppMessage(from, `❌ Order *${orderNumber}* not found. Please check the order number and try again.`);
    return;
  }

  // Validate transition
  const validTransitions = {
    ACCEPT:   { from: 'pending',   to: 'accepted' },
    REJECT:   { from: 'pending',   to: 'rejected' },
    READY:    { from: 'accepted',  to: 'ready' },
    COMPLETE: { from: 'ready',     to: 'completed' },
  };

  const transition = validTransitions[command];
  if (order.status !== transition.from) {
    await sendWhatsAppMessage(from,
      `⚠️ Cannot ${command.toLowerCase()} order *${orderNumber}*.\nCurrent status: *${order.status.toUpperCase()}*\nOrder must be *${transition.from.toUpperCase()}* to ${command.toLowerCase()} it.`
    );
    return;
  }

  // Update order status
  const updateData = {
    status: transition.to,
    last_updated_via: 'whatsapp',
    updated_at: new Date().toISOString(),
  };
  if (command === 'ACCEPT')   updateData.accepted_at   = new Date().toISOString();
  if (command === 'REJECT')   { updateData.rejected_at = new Date().toISOString(); updateData.rejection_reason = reason; }
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

  // Log status change
  await supabase.from('order_status_logs').insert({
    order_id:    order.id,
    status_from: order.status,
    status_to:   transition.to,
    changed_via: 'whatsapp',
    notes:       reason || null,
  }).then(() => {}).catch(() => {});

  // Confirm to shopkeeper
  const confirmMessages = {
    ACCEPT:   `✅ Order *${orderNumber}* accepted!\nCustomer will be notified.`,
    REJECT:   `❌ Order *${orderNumber}* rejected.\nReason: ${reason}\nCustomer will be notified.`,
    READY:    `🎉 Order *${orderNumber}* marked as ready for pickup!\nCustomer will be notified.`,
    COMPLETE: `✔️ Order *${orderNumber}* marked as completed. Well done!`,
  };

  await sendWhatsAppMessage(from, confirmMessages[command]);

  // TODO: Notify customer (fetch customer phone from order_customer_details)
  // This will be wired once customer phone is stored
  logger.info({ orderNumber, newStatus: transition.to }, `Order status updated via WhatsApp`);
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

  if (type !== 'text') {
    // For non-text messages, just acknowledge
    await sendWhatsAppMessage(from,
      `Hi ${name}! 👋 I can only process text commands right now.\n\nReply *HELP* to see available commands.`
    );
    return;
  }

  const text   = message.text?.body?.trim() || '';
  const parsed = parseCommand(text);

  logger.info({ text, parsed }, 'Text message received');

  if (!parsed) {
    // Unknown message — send help
    await sendWhatsAppMessage(from,
      `Hi ${name}! 👋 I didn't understand that.\n\n` +
      `Here are the commands I understand:\n\n` +
      `*ACCEPT ORD-XXXX* — Accept an order\n` +
      `*REJECT ORD-XXXX reason* — Reject with reason\n` +
      `*READY ORD-XXXX* — Mark order ready for pickup\n` +
      `*COMPLETE ORD-XXXX* — Mark order completed\n` +
      `*HELP* — Show this menu\n\n` +
      `_Powered by Groovia_ 🛒`
    );
    return;
  }

  if (parsed.command === 'HELP') {
    await sendWhatsAppMessage(from,
      `*Groovia Order Commands* 📦\n\n` +
      `*ACCEPT ORD-XXXX*\nAccept a pending order\n\n` +
      `*REJECT ORD-XXXX [reason]*\nReject with optional reason\n\n` +
      `*READY ORD-XXXX*\nMark order ready for pickup\n\n` +
      `*COMPLETE ORD-XXXX*\nMark order as delivered/completed\n\n` +
      `_Need help? Contact admin@groovia.co.in_`
    );
    return;
  }

  // Process order command
  await handleOrderCommand(from, parsed);
}

function handleStatusUpdate(status) {
  logger.info({
    id:        status.id,
    status:    status.status,
    recipient: status.recipient_id,
  }, `📊 Status: ${status.status}`);
}

module.exports = { handleWebhookPayload, sendWhatsAppMessage };
