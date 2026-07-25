const logger = require('../utils/logger');

// In-memory deduplication cache.
// For multi-instance deployments, replace with Redis.
const processedMessages = new Set();
const DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function markProcessed(messageId) {
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), DEDUP_TTL_MS).unref();
}

async function handleWebhookPayload(payload) {
  try {
    if (payload.object !== 'whatsapp_business_account') {
      logger.debug({ object: payload.object }, 'Ignored non-WhatsApp payload');
      return;
    }

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        // Incoming messages
        for (const message of value.messages || []) {
          if (processedMessages.has(message.id)) {
            logger.info({ id: message.id }, 'Duplicate message skipped');
            continue;
          }
          markProcessed(message.id);
          await handleIncomingMessage(message, value);
        }

        // Status updates (sent / delivered / read / failed)
        for (const status of value.statuses || []) {
          await handleStatusUpdate(status);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error processing webhook payload');
  }
}

async function handleIncomingMessage(message, value) {
  const from = message.from;
  const type = message.type;
  const contact = value.contacts?.[0];

  logger.info(
    { from, type, id: message.id, name: contact?.profile?.name },
    '📩 Incoming message'
  );

  switch (type) {
    case 'text':
      logger.info({ text: message.text.body }, 'Text message received');
      // TODO: Reply, save to DB, forward to CRM
      break;

    case 'image':
    case 'audio':
    case 'video':
    case 'document':
    case 'sticker':
      logger.info({ media: message[type] }, `${type} received`);
      break;

    case 'interactive':
      logger.info({ interactive: message.interactive }, 'Interactive reply');
      break;

    case 'button':
      logger.info({ button: message.button }, 'Button reply');
      break;

    case 'location':
      logger.info({ location: message.location }, 'Location received');
      break;

    default:
      logger.info({ type, message }, 'Unhandled message type');
  }
}

async function handleStatusUpdate(status) {
  logger.info(
    {
      id: status.id,
      status: status.status,
      recipient: status.recipient_id,
      timestamp: status.timestamp,
    },
    `📊 Status: ${status.status}`
  );
}

module.exports = { handleWebhookPayload };