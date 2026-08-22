const express = require('express');
const config = require('../config');
const logger = require('../utils/logger');
const { notifyCustomer, notifyCustomerOfOrderEdit, generateOrderInvoicePdf } = require('../services/customerNotifier');
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
// Pushes a shop's active products to its Meta Commerce Catalog
// (retailer_id = products.id). Called two ways from the dashboard: a
// Super Admin's manual "Sync catalog now" button (always runs), and an
// automatic trigger when a product's availability flips due to stock
// hitting/leaving zero (only when that shop's catalog_auto_sync_enabled
// flag is on — checked by the caller, not here, so the manual button
// still works for a shop with the flag off).
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
// Body: { status: string, shopId: string, actorName?: string, reason?: string, via?: string }
// Proactive visibility for staff still watching WhatsApp when the
// dashboard (or an item edit) actions an order instead — without this,
// the original new-order-alert message (with live Accept/Reject/Edit
// buttons that WhatsApp never grays out) just sits there unchanged, and
// a teammate has no way to know the order was already handled short of
// tapping a stale button and getting handleOrderCommand's own bounce-back.
// `via` lets a caller other than the order-status PATCH route (e.g. an
// item-edit auto-accept) describe itself accurately instead of
// defaulting to "the dashboard".
router.post('/orders/:orderId/notify-staff', requireInternalSecret, async (req, res) => {
  const { orderId } = req.params;
  const { status, shopId, actorName, reason, via } = req.body || {};

  if (!orderId || !status || !shopId) {
    return res.status(400).json({ error: 'orderId, status, and shopId are required' });
  }

  try {
    await notifyStaffOfDashboardStatusChange(orderId, shopId, status, actorName, reason, via);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err, orderId, status, shopId }, 'Internal notify-staff endpoint failed');
    return res.status(500).json({ error: 'Failed to notify staff' });
  }
});

// POST /internal/orders/:orderId/notify-edit
// Body: { shopId: string, diffLines: string[], newTotal: number }
// Dashboard equivalent of the WhatsApp edit flow's "Done" diff summary —
// staff editing an order's items from the dashboard should give the
// customer the same "here's what changed" message the WhatsApp-side Edit
// flow already sends, via the same notifyCustomerOfOrderEdit used there.
router.post('/orders/:orderId/notify-edit', requireInternalSecret, async (req, res) => {
  const { orderId } = req.params;
  const { shopId, diffLines, newTotal } = req.body || {};

  if (!orderId || !shopId || !Array.isArray(diffLines) || diffLines.length === 0 || newTotal === undefined) {
    return res.status(400).json({ error: 'orderId, shopId, diffLines, and newTotal are required' });
  }

  try {
    const sent = await notifyCustomerOfOrderEdit(orderId, shopId, diffLines, newTotal);
    return res.status(sent ? 200 : 502).json({ success: sent });
  } catch (err) {
    logger.error({ err, orderId, shopId }, 'Internal notify-edit endpoint failed');
    return res.status(500).json({ error: 'Failed to send edit notification' });
  }
});

// GET /internal/orders/:orderId/invoice?shopId=...
// Lets the dashboard show/download the same invoice PDF the customer got
// on completion, without duplicating PDF-generation logic in a second
// language/runtime — the dashboard just proxies this response through to
// the browser (see /api/shop/orders/[id]/invoice). Not gated on the
// order's status: works for any completed-or-not order in the shop, since
// staff may want to preview it before the order is actually marked
// complete. Deliberately not exposed anywhere in the staff WhatsApp
// flow — only reachable via this internal route, matching "not in shop
// owner WhatsApp."
router.get('/orders/:orderId/invoice', requireInternalSecret, async (req, res) => {
  const { orderId } = req.params;
  const shopId = req.query.shopId;

  if (!orderId || !shopId) {
    return res.status(400).json({ error: 'orderId and shopId are required' });
  }

  try {
    const result = await generateOrderInvoicePdf(orderId, String(shopId));
    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice-${result.orderNumber}.pdf"`);
    return res.send(result.buffer);
  } catch (err) {
    logger.error({ err, orderId, shopId }, 'Internal invoice endpoint failed');
    return res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// GET /internal/whatsapp/phone-lookup?phoneNumberId=...
// Verifies a WhatsApp phone_number_id directly against Meta's own Graph
// API and returns Meta's actual display_phone_number/verified_name for
// it. Backs the admin WhatsApp-connection form (dashboard) so that field
// is never hand-typed — confirmed real bug: a hand-typed value had
// drifted from Meta's actual number, so every wa.me redirect and "call
// this shop" display pointed at a number that had never sent the
// customer anything. This also doubles as validation: a wrong/typo'd
// phone_number_id fails here loudly instead of saving silently.
router.get('/whatsapp/phone-lookup', requireInternalSecret, async (req, res) => {
  const phoneNumberId = req.query.phoneNumberId;

  if (!phoneNumberId) {
    return res.status(400).json({ error: 'phoneNumberId is required' });
  }

  try {
    const url = `https://graph.facebook.com/${config.graphApiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${config.whatsappToken}`;
    const metaRes = await fetch(url);
    const data = await metaRes.json();

    if (!metaRes.ok || !data.display_phone_number) {
      logger.warn({ phoneNumberId, metaError: data.error }, 'Meta phone-number lookup failed');
      return res.status(422).json({ error: data.error?.message || "Meta couldn't find a WhatsApp number for this Phone Number ID" });
    }

    return res.status(200).json({ display_phone_number: data.display_phone_number, verified_name: data.verified_name || null });
  } catch (err) {
    logger.error({ err, phoneNumberId }, 'Phone-number lookup request failed');
    return res.status(502).json({ error: 'Failed to reach Meta' });
  }
});

module.exports = router;
