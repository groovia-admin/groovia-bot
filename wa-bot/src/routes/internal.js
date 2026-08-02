const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const { notifyCustomer } = require('../services/customerNotifier');
const { syncShopCatalog } = require('../services/catalogSync');

const router = express.Router();

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));

  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
}

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
// Body: { status: 'accepted' | 'ready' | 'completed' | 'rejected' | 'cancelled' }
// `status` is the order's new orders.status value — same key the
// WhatsApp-triggered path uses, so both callers agree on one vocabulary.
router.post('/orders/:orderId/notify', requireInternalSecret, async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body || {};

  if (!orderId || !status) {
    return res.status(400).json({ error: 'orderId and status are required' });
  }

  try {
    const sent = await notifyCustomer(orderId, status);
    return res.status(sent ? 200 : 502).json({ success: sent });
  } catch (err) {
    logger.error({ err, orderId, status }, 'Internal notify endpoint failed');
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

module.exports = router;
