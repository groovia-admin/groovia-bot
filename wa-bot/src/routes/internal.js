const express = require('express');
const config = require('../config');
const logger = require('../utils/logger');
const { notifyCustomer } = require('../services/customerNotifier');
const { syncShopCatalog } = require('../services/catalogSync');
const { resendPendingOrderAlerts, sendOrderPlacedConfirmation, notifyStaffOfDashboardStatusChange } = require('../services/orderCreator');
const { timingSafeEqualStrings } = require('../utils/timingSafeCompare');

const router = express.Router();

// Shared-secret auth for server-to-server calls (dashboard -> wa-bot).
// Without this, anyone who finds the route could trigger WhatsApp sends
// to arbitrary customers, risking the WABA's reputation/ban.
function requireInternalSecret(req, res, next) {
  const provided = req.get('x-internal-secret');

  if (!provided || !timingSafeEqualStrings(provided, config.internalApiSecret)) {
    logger.warn({ path: req.path }, 'Rejected internal request — missing/invalid secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// POST /internal/orders/:orderId/notify
// Body: { status: 'accepted' | 'ready' | 'completed' | 'rejected' | 'cancelled', shopId: string }
// `status` is the order's new orders.status value — same key the
// WhatsApp-triggered path uses, so both callers agree on one vocabulary.
// `shopId` is required and enforced inside notifyCustomer's own query —
// the shared internal secret authenticates "this is our dashboard calling",
// not "this caller may act on this specific order", so shopId is what
// stops any known orderId from triggering a notification for an order
// belonging to a shop the caller has no business touching.
router.post('/orders/:orderId/notify', requireInternalSecret, async (req, res) => {
  const { orderId } = req.params;
  const { status, shopId } = req.body || {};

  if (!orderId || !status || !shopId) {
    return res.status(400).json({ error: 'orderId, status, and shopId are required' });
  }

  try {
    const sent = await notifyCustomer(orderId, status, shopId);
    return res.status(sent ? 200 : 502).json({ success: sent });
  } catch (err) {
    logger.error({ err, orderId, status, shopId }, 'Internal notify endpoint failed');
    return res.status(500).json({ error: 'Failed to send notification' });
  }
});

// POST /internal/shops/:shopId/sync-catalog
// On-demand push of a shop's active products to its Meta Commerce
// Catalog (retailer_id = products.id). Not automatic on product save —
// call this after editing products, or on a manual "Sync catalog" action.
router.post('/shops/:shopId/sync-catalog', requireInternalSecret, async (req, res) => {
  const { shopId } = req.params;

  if (!shopId) {
    return res.status(400).json({ error: 'shopId is required' });
  }

  const result = await syncShopCatalog(shopId);
  return res.status(result.success ? 200 : 502).json(result);
});

// POST /internal/shops/:shopId/resend-pending-alerts
// One-time (or repeatable) catch-up for orders that went 'pending'
// before delivery tracking existed, or whose alert otherwise never got
// a tracked row — those never had a chance to hit the retry/template-
// fallback path. Safe to call more than once: only orders still
// 'pending' are touched.
router.post('/shops/:shopId/resend-pending-alerts', requireInternalSecret, async (req, res) => {
  const { shopId } = req.params;

  if (!shopId) {
    return res.status(400).json({ error: 'shopId is required' });
  }

  const result = await resendPendingOrderAlerts(shopId);
  return res.status(result.success ? 200 : 502).json(result);
});

// POST /internal/orders/:orderId/confirm-placement
// Body: { shopId: string }
// The webview (Phase 5/6) creates orders directly in Supabase from the
// dashboard, not through wa-bot — so unlike the native-catalog flow
// (which sends this inline right after creation, same conversation),
// there's no in-progress WhatsApp exchange to reply into. This is the
// dashboard's way of asking wa-bot to send that same "order placed,
// cancel within 5 min" message on its behalf.
router.post('/orders/:orderId/confirm-placement', requireInternalSecret, async (req, res) => {
  const { orderId } = req.params;
  const { shopId } = req.body || {};

  if (!orderId || !shopId) {
    return res.status(400).json({ error: 'orderId and shopId are required' });
  }

  const result = await sendOrderPlacedConfirmation(orderId, shopId);
  return res.status(result.success ? 200 : 502).json(result);
});

// POST /internal/orders/:orderId/notify-staff
// Body: { status: string, shopId: string, actorName?: string, reason?: string }
// Proactive visibility for staff still watching WhatsApp when the
// dashboard actions an order instead — without this, the original
// new-order-alert message (with live Accept/Reject/Edit buttons that
// WhatsApp never grays out) just sits there unchanged, and a teammate
// has no way to know the order was already handled short of tapping a
// stale button and getting handleOrderCommand's own bounce-back.
router.post('/orders/:orderId/notify-staff', requireInternalSecret, async (req, res) => {
  const { orderId } = req.params;
  const { status, shopId, actorName, reason } = req.body || {};

  if (!orderId || !status || !shopId) {
    return res.status(400).json({ error: 'orderId, status, and shopId are required' });
  }

  try {
    await notifyStaffOfDashboardStatusChange(orderId, shopId, status, actorName, reason);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err, orderId, status, shopId }, 'Internal notify-staff endpoint failed');
    return res.status(500).json({ error: 'Failed to notify staff' });
  }
});

module.exports = router;
