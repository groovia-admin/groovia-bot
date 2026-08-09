const logger = require('../utils/logger');
const config = require('../config');
// Explicit import, not the bare global — Railway's Node 20 runtime doesn't
// expose Blob as a global the same way Node 24 (used locally) does, the
// same File-not-defined class of gap already hit in api/shop/logo/route.ts.
const { Blob } = require('node:buffer');

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

// Meta's template UI often defaults to "English (US)" (en_US) rather
// than the neutral "English" (en) code declares — picking the wrong one
// at creation time fails outright (#132001, "template name does not
// exist in <language>") rather than falling back on its own. Confirmed
// in production against order_reminder: reminderService.js called
// sendWhatsAppTemplate directly with a single hardcoded 'en_US' and no
// fallback, so every single reminder silently failed with 132001 and
// there was no second attempt — this is what customerNotifier.js's
// notifyCustomer already guarded against for every other template, just
// not exposed for other callers to reuse until now.
const LANGUAGE_FALLBACKS = ['en', 'en_US'];

async function sendWhatsAppTemplateWithFallback(to, templateName, primaryLanguage, components, overrides = {}) {
  // Always try the caller's own configured language first — that's the
  // one presumed actually confirmed against WhatsApp Manager, not a
  // guess. Only if that fails does this try the other common locale
  // code, so a template correctly configured under its declared language
  // never wastes a doomed-to-fail attempt first.
  const languages = [primaryLanguage, ...LANGUAGE_FALLBACKS.filter((l) => l !== primaryLanguage)];

  for (const language of languages) {
    const sent = await sendWhatsAppTemplate(to, templateName, language, components, overrides);
    if (sent) return true;
  }

  return false;
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

// ── Media upload (step 1 of sending a document — Graph API requires the
// file to be uploaded to get a media id before it can be referenced by
// any message, there's no way to send raw bytes inline) ──
async function uploadWhatsAppMedia(buffer, filename, mimeType, overrides = {}) {
  const phoneNumberId = overrides.phoneNumberId || config.phoneNumberId;
  const token = overrides.token || config.whatsappToken;

  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const res = await fetch(
      `https://graph.facebook.com/${config.graphApiVersion}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: form,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logSendFailure('❌ WhatsApp media upload failed', { filename }, data);
      return null;
    }

    return data.id || null;
  } catch (err) {
    logger.error({ err, filename }, '❌ WhatsApp media upload error');
    return null;
  }
}

// ── Document message — sends a previously uploaded media id as a file
// (used for the completion invoice PDF). Not a URL-based `link` document,
// deliberately: this avoids standing up any new public storage bucket
// just to host invoices, reusing Meta's own media hosting instead. ──
async function sendWhatsAppDocument(to, mediaId, filename, caption, overrides = {}) {
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
          type: 'document',
          document: { id: mediaId, filename, caption },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      logSendFailure('❌ WhatsApp document send failed', { to, mediaId }, data);
      return false;
    }

    logger.info({ to, messageId: data.messages?.[0]?.id }, '✅ WhatsApp document sent');
    return true;
  } catch (err) {
    logger.error({ err, to }, '❌ WhatsApp document send error');
    return false;
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendWhatsAppTemplateDetailed,
  sendWhatsAppTemplateWithFallback,
  sendCatalogMessage,
  sendButtonMessage,
  sendButtonMessageDetailed,
  sendListMessage,
  sendCtaUrlMessage,
  uploadWhatsAppMedia,
  sendWhatsAppDocument,
};
