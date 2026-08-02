const logger = require('../utils/logger');
const config = require('../config');

// ── Plain text message (used for staff-facing replies, always inside the
// 24h customer service window since it's always a direct reply) ──
async function sendWhatsAppMessage(to, text, overrides = {}) {
  const phoneNumberId = overrides.phoneNumberId || config.phoneNumberId;
  const token = overrides.token || config.whatsappToken;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.graphApiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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

// ── Approved template message (required for any business-initiated
// message, e.g. customer notifications not sent in direct reply) ──
async function sendWhatsAppTemplate(to, templateName, languageCode, components, overrides = {}) {
  const phoneNumberId = overrides.phoneNumberId || config.phoneNumberId;
  const token = overrides.token || config.whatsappToken;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.graphApiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logger.error({ to, templateName, error: data }, '❌ WhatsApp template send failed');
      return false;
    }

    logger.info({ to, templateName, messageId: data.messages?.[0]?.id }, '✅ WhatsApp template sent');
    return true;
  } catch (err) {
    logger.error({ err, to, templateName }, '❌ WhatsApp template send error');
    return false;
  }
}

// ── Native catalog invite (greeting -> "View catalog" native button) ──
async function sendCatalogMessage(to, bodyText, thumbnailProductId, overrides = {}) {
  const phoneNumberId = overrides.phoneNumberId || config.phoneNumberId;
  const token = overrides.token || config.whatsappToken;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.graphApiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'catalog_message',
            body: { text: bodyText },
            action: {
              name: 'catalog_message',
              parameters: thumbnailProductId
                ? { thumbnail_product_retailer_id: thumbnailProductId }
                : undefined,
            },
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logger.error({ to, error: data }, '❌ WhatsApp catalog message send failed');
      return false;
    }

    logger.info({ to, messageId: data.messages?.[0]?.id }, '✅ WhatsApp catalog message sent');
    return true;
  } catch (err) {
    logger.error({ err, to }, '❌ WhatsApp catalog message send error');
    return false;
  }
}

// ── Button reply prompt (slot / payment / confirm — max 3 buttons) ──
async function sendButtonMessage(to, bodyText, buttons, overrides = {}) {
  const phoneNumberId = overrides.phoneNumberId || config.phoneNumberId;
  const token = overrides.token || config.whatsappToken;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${config.graphApiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
              buttons: buttons.map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title },
              })),
            },
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logger.error({ to, error: data }, '❌ WhatsApp button message send failed');
      return false;
    }

    logger.info({ to, messageId: data.messages?.[0]?.id }, '✅ WhatsApp button message sent');
    return true;
  } catch (err) {
    logger.error({ err, to }, '❌ WhatsApp button message send error');
    return false;
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendCatalogMessage,
  sendButtonMessage,
};
