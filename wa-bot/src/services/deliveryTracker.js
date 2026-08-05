const logger = require('../utils/logger');
const { getSupabase } = require('./shopResolver');

// Meta's own documented fix for this exact error is "send a template
// message instead" — retrying the same non-template message will fail
// identically forever, since the 24h customer-service window doesn't
// reopen on its own. Anything else (network blips, transient 5xx) is
// treated as retryable.
const WINDOW_EXPIRED_CODE = 131047;

// Backoff schedule for genuinely transient failures — a handful of
// spaced-out attempts, then give up and surface it rather than retrying
// forever. Chosen to be forgiving of short blips (1 min) while not
// hammering Meta's API if something's actually broken (20 min final gap).
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 20 * 60_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

function isWindowExpired(errorCode) {
  return Number(errorCode) === WINDOW_EXPIRED_CODE;
}

/**
 * Creates a 'pending' delivery record before the first send attempt —
 * so even a crash between "recorded" and "sent" leaves a row an operator
 * (or a future reconcile job) can find, rather than losing the attempt
 * entirely. Returns the new row's id, or null if Supabase isn't
 * configured/the insert failed (callers should still attempt the send;
 * tracking is a safety net, not a gate on sending).
 */
async function recordDelivery({ orderId, recipientPhone, purpose, payload }) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('notification_deliveries')
    .insert({
      order_id: orderId,
      recipient_phone: recipientPhone,
      purpose,
      payload,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    logger.error({ error, orderId, purpose }, 'Failed to record notification delivery');
    return null;
  }

  return data.id;
}

async function markSent(deliveryId, messageId) {
  if (!deliveryId) return;
  const supabase = getSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from('notification_deliveries')
    .update({ status: 'sent', wamid: messageId, updated_at: new Date().toISOString() })
    .eq('id', deliveryId);

  if (error) {
    logger.error({ error, deliveryId }, 'Failed to mark delivery as sent');
  }
}

/**
 * Records a failed send attempt and decides what happens next:
 *   - window-expired (131047): marked 'needs_template', no retry
 *     scheduled — retrying this exact message can never succeed.
 *   - anything else, under MAX_ATTEMPTS: 'failed' with next_retry_at set
 *     per the backoff schedule, for the retry loop to pick up.
 *   - anything else, at MAX_ATTEMPTS: 'exhausted' — gave it a fair
 *     number of tries, stop and let it surface in logs/dashboard rather
 *     than retry indefinitely.
 */
async function recordFailure(deliveryId, error, attemptCount) {
  if (!deliveryId) return;
  const supabase = getSupabase();
  if (!supabase) return;

  const code = error?.code ?? null;
  const message = error?.message ?? null;

  let status;
  let nextRetryAt = null;

  if (isWindowExpired(code)) {
    status = 'needs_template';
  } else if (attemptCount >= MAX_ATTEMPTS) {
    status = 'exhausted';
  } else {
    status = 'failed';
    nextRetryAt = new Date(Date.now() + RETRY_DELAYS_MS[attemptCount]).toISOString();
  }

  const { error: updateError } = await supabase
    .from('notification_deliveries')
    .update({
      status,
      attempt_count: attemptCount + 1,
      last_error_code: code,
      last_error_message: message,
      next_retry_at: nextRetryAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);

  if (updateError) {
    logger.error({ error: updateError, deliveryId }, 'Failed to record delivery failure');
  }
}

async function markDeliveredByWamid(wamid) {
  const supabase = getSupabase();
  if (!supabase || !wamid) return null;

  const { data, error } = await supabase
    .from('notification_deliveries')
    .update({ status: 'delivered', updated_at: new Date().toISOString() })
    .eq('wamid', wamid)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error({ error, wamid }, 'Failed to mark delivery as delivered');
    return null;
  }

  return data;
}

async function findByWamid(wamid) {
  const supabase = getSupabase();
  if (!supabase || !wamid) return null;

  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('id, order_id, recipient_phone, purpose, payload, attempt_count, status')
    .eq('wamid', wamid)
    .maybeSingle();

  if (error) {
    logger.error({ error, wamid }, 'Failed to look up delivery by wamid');
    return null;
  }

  return data;
}

/**
 * Rows the retry loop should attempt right now: genuinely transient
 * failures (never window-expired ones — see recordFailure) whose
 * scheduled retry time has passed, ordered oldest-due-first so a backlog
 * drains in order rather than newest-first.
 */
async function getDueRetries(limit = 25) {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('id, order_id, recipient_phone, purpose, payload, attempt_count')
    .eq('status', 'failed')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error({ error }, 'Failed to load due notification retries');
    return [];
  }

  return data || [];
}

module.exports = {
  WINDOW_EXPIRED_CODE,
  isWindowExpired,
  recordDelivery,
  markSent,
  recordFailure,
  markDeliveredByWamid,
  findByWamid,
  getDueRetries,
};
