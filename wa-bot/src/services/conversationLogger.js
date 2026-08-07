const logger = require('../utils/logger');
const { getSupabase, normalizeWhatsappFrom } = require('./shopResolver');

// Customer-facing conversation history, shown to shop owners in the
// dashboard — deliberately NOT used for staff command messages
// (ACCEPT/REJECT/etc.), only the customer ordering conversation.
// Best-effort throughout: a logging failure must never affect message
// delivery or order processing, so every path here swallows its own errors.

async function getOrCreateConversation(shopId, phone) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: existing, error: findError } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('shop_id', shopId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError) {
    logger.error({ error: findError, shopId, phone }, 'Conversation lookup failed');
    return null;
  }

  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from('whatsapp_conversations')
    .insert({ shop_id: shopId, customer_phone: phone, status: 'open' })
    .select('id')
    .single();

  if (createError) {
    logger.error({ error: createError, shopId, phone }, 'Conversation creation failed');
    return null;
  }

  return created.id;
}

// direction: 'inbound' | 'outbound'; senderType: 'customer' | 'bot'
async function logMessage(shopId, phone, direction, senderType, messageType, content, externalMessageId) {
  try {
    const supabase = getSupabase();
    if (!supabase || !shopId || !phone) return;

    // Callers pass whatever shape the webhook/staff-command handler had on
    // hand (bare "919876543210" or "+919876543210") — normalize so the same
    // customer always maps to the same conversation row regardless of which
    // call site logged first.
    const normalizedPhone = normalizeWhatsappFrom(phone) || phone;

    const conversationId = await getOrCreateConversation(shopId, normalizedPhone);
    if (!conversationId) return;

    const { error } = await supabase.from('whatsapp_messages').insert({
      conversation_id: conversationId,
      direction,
      sender_type: senderType,
      message_type: messageType,
      content: content || null,
      external_message_id: externalMessageId || null,
      metadata: {},
    });

    if (error) {
      logger.error({ error, shopId, phone }, 'Failed to log conversation message');
      return;
    }

    const { error: touchError } = await supabase
      .from('whatsapp_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    if (touchError) {
      logger.error({ error: touchError, conversationId }, 'Failed to update conversation last_message_at');
    }
  } catch (err) {
    logger.error({ err, shopId, phone }, 'Conversation logging threw');
  }
}

module.exports = { logMessage };
