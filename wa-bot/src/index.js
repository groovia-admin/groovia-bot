const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');
const webhookRouter = require('./routes/webhook');
const internalRouter = require('./routes/internal');
const { getDueRetries } = require('./services/deliveryTracker');
const { retryNewOrderAlert, retryOrderPlacedConfirmation, processDueNewOrderAlerts } = require('./services/orderCreator');
const { processDueReminders } = require('./services/reminderService');
const { processDueDailySummaries } = require('./services/dailySummaryService');

const app = express();

// Railway (and any platform load balancer) sits in front of this app, so
// requests arrive with X-Forwarded-For rather than a real peer IP. Without
// this, express-rate-limit either buckets all traffic under one IP or
// refuses to start (it detects the header and errors if trust proxy isn't
// configured, since blindly trusting it without one would let a client
// spoof its own rate-limit bucket).
app.set('trust proxy', 1);

// Capture raw body for HMAC signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Webhook traffic is real customer/staff messages — generous enough not to
// throttle a genuinely busy shop, tight enough to blunt a flood aimed at
// exhausting Meta API quota or Supabase connections (each POST costs a
// signature computation before it's rejected either way).
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Internal traffic is server-to-server (the dashboard backend only) — low
// legitimate volume expected, so this can be much tighter.
const internalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'groovia-bot',
    env: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// Root
app.get('/', (_req, res) => {
  res.status(200).json({ message: 'Groovia WhatsApp Bot is running' });
});

// Webhook
app.use('/webhook', webhookLimiter, webhookRouter);

// Internal (server-to-server, e.g. dashboard-triggered notifications)
app.use('/internal', internalLimiter, internalRouter);

// 404
app.use((_req, res) => res.sendStatus(404));

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).send('Internal Server Error');
});

// Start server
const server = app.listen(config.port, () => {
  logger.info(
    `🚀 Groovia webhook listening on port ${config.port} [${config.nodeEnv}]`
  );
});

// Notification retry loop — picks up genuinely transient send failures
// (not window-expired ones, which go straight to a template fallback
// from handleStatusUpdate instead; see deliveryTracker.js) on a backoff
// schedule so a message doesn't just get silently lost.
const RETRY_HANDLERS = {
  new_order_alert: retryNewOrderAlert,
  order_placed: retryOrderPlacedConfirmation,
};
const RETRY_INTERVAL_MS = 60 * 1000;

async function processDueRetries() {
  const due = await getDueRetries();

  for (const delivery of due) {
    const handler = RETRY_HANDLERS[delivery.purpose];
    if (!handler) continue;

    try {
      await handler(delivery);
    } catch (err) {
      logger.error({ err, deliveryId: delivery.id }, 'Notification retry threw');
    }
  }
}

const retryTimer = setInterval(() => {
  processDueRetries().catch((err) => logger.error({ err }, 'Notification retry loop failed'));
}, RETRY_INTERVAL_MS);
retryTimer.unref();

// Delayed new-order alert — deliberately NOT an in-memory setTimeout
// per order. A per-order timer would silently vanish on a Railway
// restart/redeploy mid-window, leaving that order's shopkeeper alert
// never sent at all; polling a DB column every minute survives a
// restart fine, it just picks the order back up on the next tick.
// Shares the same 60s cadence as the retry loop above — no reason for
// a tighter poll when the underlying delay is a fixed 5 minutes either
// way.
const newOrderAlertTimer = setInterval(() => {
  processDueNewOrderAlerts().catch((err) => logger.error({ err }, 'Delayed new-order alert scan failed'));
}, RETRY_INTERVAL_MS);
newOrderAlertTimer.unref();

// Reminder + auto-reject scan — same DB-polled pattern, same reason
// (restart-safety). Independent of the two timers above: it only ever
// touches orders whose staff alert has already gone out, so there's no
// ordering dependency on processDueNewOrderAlerts within a single tick.
const reminderTimer = setInterval(() => {
  processDueReminders().catch((err) => logger.error({ err }, 'Reminder/auto-reject scan failed'));
}, RETRY_INTERVAL_MS);
reminderTimer.unref();

// Daily summary scan — same poll-and-claim pattern as the timers above.
// Fires at most once per shop per shop-local calendar day (see
// processDueDailySummaries), so a 60s cadence here is just about keeping
// the actual send close to the shop's configured time, not a correctness
// requirement.
const dailySummaryTimer = setInterval(() => {
  processDueDailySummaries().catch((err) => logger.error({ err }, 'Daily summary scan failed'));
}, RETRY_INTERVAL_MS);
dailySummaryTimer.unref();

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after 10s');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});