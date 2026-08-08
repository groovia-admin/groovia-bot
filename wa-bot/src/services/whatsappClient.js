const logger = require('../utils/logger');
const config = require('../config');

// Surfaces the actual Graph API error (code/message/fbtrace_id) instead of
// a blind "send failed" — the id-mismatch class of bug (e.g. #131009,
// content id not in catalog) is invisible without this.
function logSendFailure(msg, context, data) {
  const err = data?.error || {};
  logger.error(
    {
      ...context,
      code: err.code,
      message: err.message,
      details: err.error_user_msg || err.error_data?.details,
      fbtraceId: err.fbtrace_id,
    },
    msg
  );
}

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
      logSendFailure('❌ WhatsApp send failed', { to }, data);
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
//
// "Detailed" variants return { success, messageId, error } instead of a
// plain boolean — needed so the delivery tracker can record Meta's
// message id (to correlate a later status webhook) and inspect the
// actual error on failure (e.g. code 131047 to trigger a template
// fallback rather than a futile retry). The plain boolean-returning
// functions below are unchanged wrappers, kept for every existing
// caller that only checks truthiness — changing their return type to an
// object would silently break those checks, since `{success:false}` is
// still truthy in JS.
async function sendWhatsAppTemplateDetailed(to, templateName, languageCode, components, overrides = {}) {
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
      logSendFailure('❌ WhatsApp template send failed', { to, templateName }, data);
      return { success: false, messageId: null, error: data?.error || null };
    }

    const messageId = data.messages?.[0]?.id || null;
    logger.info({ to, templateName, messageId }, '✅ WhatsApp template sent');
    return { success: true, messageId, error: null };
  } catch (err) {
    logger.error({ err, to, templateName }, '❌ WhatsApp template send error');
    return { success: false, messageId: null, error: { message: err.message } };
  }
}

async function sendWhatsAppTemplate(to, templateName, languageCode, components, overrides = {}) {
  const result = await sendWhatsAppTemplateDetailed(to, templateName, languageCode, components, overrides);
  return result.success;
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
      logSendFailure('❌ WhatsApp catalog message send failed', { to }, data);
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
// See sendWhatsAppTemplateDetailed's comment above for why there's both
// a detailed and a plain-boolean variant.
async function sendButtonMessageDetailed(to, bodyText, buttons, overrides = {}) {
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
      logSendFailure('❌ WhatsApp button message send failed', { to }, data);
      return { success: false, messageId: null, error: data?.error || null };
    }

    const messageId = data.messages?.[0]?.id || null;
    logger.info({ to, messageId }, '✅ WhatsApp button message sent');
    return { success: true, messageId, error: null };
  } catch (err) {
    logger.error({ err, to }, '❌ WhatsApp button message send error');
    return { success: false, messageId: null, error: { message: err.message } };
  }
}

async function sendButtonMessage(to, bodyText, buttons, overrides = {}) {
  const result = await sendButtonMessageDetailed(to, bodyText, buttons, overrides);
  return result.success;
}

// ── List message (tap-to-select from up to 10 rows, single-select) ──
// sections: [{ title, rows: [{ id, title, description }] }]
async function sendListMessage(to, bodyText, buttonText, sections, overrides = {}) {
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
            type: 'list',
            body: { text: bodyText },
            action: { button: buttonText, sections },
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logSendFailure('❌ WhatsApp list message send failed', { to }, data);
      return false;
    }

    logger.info({ to, messageId: data.messages?.[0]?.id }, '✅ WhatsApp list message sent');
    return true;
  } catch (err) {
    logger.error({ err, to }, '❌ WhatsApp list message send error');
    return false;
  }
}

// ── Call-to-action URL button (a single tappable button carrying a
// link) ── used instead of pasting a raw URL into a text message for
// two reasons: (1) it reads as a proper button rather than a link
// buried in a paragraph, and (2) WhatsApp opens cta_url links in its
// own in-app browser consistently; a plain auto-linkified URL in a text
// message doesn't reliably get the same treatment and can kick out to
// the phone's system browser instead.
async function sendCtaUrlMessage(to, bodyText, buttonText, url, overrides = {}) {
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
            type: 'cta_url',
            body: { text: bodyText },
            action: {
              name: 'cta_url',
              parameters: { display_text: buttonText, url },
            },
          },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logSendFailure('❌ WhatsApp CTA URL message send failed', { to }, data);
      return false;
    }

    logger.info({ to, messageId: data.messages?.[0]?.id }, '✅ WhatsApp CTA URL message sent');
    return true;
  } catch (err) {
    logger.error({ err, to }, '❌ WhatsApp CTA URL message send error');
    return false;
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendWhatsAppTemplateDetailed,
  sendCatalogMessage,
  sendButtonMessage,
  sendButtonMessageDetailed,
  sendListMessage,
  sendCtaUrlMessage,
};
