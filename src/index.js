const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const webhookRouter = require('./routes/webhook');

const app = express();

// Capture raw body for HMAC signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

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
app.use('/webhook', webhookRouter);

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