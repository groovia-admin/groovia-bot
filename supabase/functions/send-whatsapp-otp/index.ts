// Supabase "Send SMS" Auth Hook — intercepts every phone-OTP send
// (signInWithOtp) and delivers the code over WhatsApp Business API instead
// of an SMS provider. Supabase still generates/validates/expires the OTP
// and issues the session; this function only changes delivery. Must
// respond within 5 seconds.
//
// Env (set via `supabase secrets set`):
//   WHATSAPP_TOKEN              Meta system-user access token (same value
//                                as wa-bot's WHATSAPP_TOKEN)
//   WHATSAPP_PHONE_NUMBER_ID    Real WABA phone_number_id (same value as
//                                wa-bot's PHONE_NUMBER_ID) — must be the
//                                production number, not the test number
//   GRAPH_API_VERSION           optional, defaults to v25.0 (matches wa-bot)
//   WA_OTP_TEMPLATE             Meta-approved Authentication template name
//   WA_OTP_TEMPLATE_LANG        template language code, e.g. "en"
//   SEND_SMS_HOOK_SECRET        "v1,whsec_..." — shown once when the hook
//                                is registered in the Supabase dashboard
//   GATE_UNKNOWN_NUMBERS        "true" to only send to phones with an
//                                active shop_users row
//   SUPABASE_URL                 auto-injected by the Edge runtime
//   SUPABASE_SERVICE_ROLE_KEY   required if GATE_UNKNOWN_NUMBERS=true
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
//                                optional SMS fallback if the WhatsApp send fails

const GRAPH_API_VERSION = Deno.env.get('GRAPH_API_VERSION') || 'v25.0';

type HookPayload = {
  user: { id: string; phone: string; [key: string]: unknown };
  sms: { otp: string; [key: string]: unknown };
};

function hookError(httpCode: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Standard Webhooks signature verification ──────────────────────
// https://www.standardwebhooks.com — Supabase Auth Hooks follow this spec.
// Secret arrives as "v1,whsec_<base64>"; signature header can carry
// multiple space-separated "v1,<base64-sig>" values (key rotation) — a
// match on any one is valid.
async function verifyWebhookSignature(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = req.headers.get('webhook-id');
  const timestamp = req.headers.get('webhook-timestamp');
  const signatureHeader = req.headers.get('webhook-signature');

  if (!id || !timestamp || !signatureHeader) return false;

  // Reject stale/replayed requests — 5 minute tolerance either direction.
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }

  const secretB64 = secret.replace(/^v1,whsec_/, '');
  const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  const candidates = signatureHeader.split(' ').map((s) => s.replace(/^v1,/, ''));
  return candidates.some((candidate) => timingSafeEqual(candidate, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Optional gate: only send to numbers with an active shop_users row ──
async function isKnownActiveNumber(phone: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('GATE_UNKNOWN_NUMBERS is enabled but SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not set');
  }

  // user.phone from Supabase Auth is E.164 without the leading '+'.
  const normalized = phone.startsWith('+') ? phone : `+${phone}`;

  const url =
    `${supabaseUrl}/rest/v1/shop_users?select=id&phone_number=eq.${encodeURIComponent(normalized)}&is_active=eq.true&limit=1`;

  const res = await fetch(url, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });

  if (!res.ok) {
    throw new Error(`shop_users lookup failed: ${res.status} ${await res.text()}`);
  }

  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

// ── WhatsApp send (Authentication template, copy-code button) ──
// NOTE: verify the button parameter shape (`type`/`copy_code` field names)
// against Meta's current WhatsApp Business Platform docs when you create
// and test-send the template — Meta has revised this payload shape before.
async function sendWhatsAppOtp(phone: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const template = Deno.env.get('WA_OTP_TEMPLATE');
  const templateLang = Deno.env.get('WA_OTP_TEMPLATE_LANG') || 'en';

  if (!token || !phoneNumberId || !template) {
    return { ok: false, error: 'WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, or WA_OTP_TEMPLATE not configured' };
  }

  const to = phone.startsWith('+') ? phone.slice(1) : phone;

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: templateLang },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: otp }] },
          {
            type: 'button',
            sub_type: 'copy_code',
            index: '0',
            parameters: [{ type: 'copy_code', copy_code: otp }],
          },
        ],
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { ok: false, error: data?.error?.message || `WhatsApp send failed (${res.status})` };
  }

  return { ok: true };
}

// ── Optional SMS fallback via Twilio ──
async function sendSmsFallback(phone: string, otp: string): Promise<{ ok: boolean; error?: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: 'Twilio fallback not configured' };
  }

  const to = phone.startsWith('+') ? phone : `+${phone}`;
  const body = new URLSearchParams({ To: to, From: fromNumber, Body: `Your Groovia login code is ${otp}` });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    return { ok: false, error: `Twilio fallback failed (${res.status})` };
  }

  return { ok: true };
}

Deno.serve(async (req: Request) => {
  const rawBody = await req.text();

  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  if (!secret) {
    return hookError(500, 'SEND_SMS_HOOK_SECRET is not configured');
  }

  const verified = await verifyWebhookSignature(req, rawBody, secret);
  if (!verified) {
    return hookError(401, 'Invalid webhook signature');
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return hookError(400, 'Invalid JSON payload');
  }

  const phone = payload.user?.phone;
  const otp = payload.sms?.otp;

  if (!phone || !otp) {
    return hookError(400, 'Payload missing user.phone or sms.otp');
  }

  if (Deno.env.get('GATE_UNKNOWN_NUMBERS') === 'true') {
    try {
      const known = await isKnownActiveNumber(phone);
      if (!known) {
        return hookError(400, 'Number not authorized');
      }
    } catch (err) {
      return hookError(500, err instanceof Error ? err.message : 'Gate check failed');
    }
  }

  const waResult = await sendWhatsAppOtp(phone, otp);
  if (waResult.ok) {
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const smsResult = await sendSmsFallback(phone, otp);
  if (smsResult.ok) {
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return hookError(500, `WhatsApp send failed (${waResult.error}); SMS fallback: ${smsResult.error}`);
});
