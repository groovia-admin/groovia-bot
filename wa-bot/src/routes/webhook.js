const express = require('express');
const config = require('../config');
const logger = require('../utils/logger');
const verifySignature = require('../middleware/verifySignature');
const { handleWebhookPayload } = require('../services/messageHandler');
const { timingSafeEqualStrings } = require('../utils/timingSafeCompare');

const router = express.Router();

// ---------- GET /webhook — Meta verification ----------
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && timingSafeEqualStrings(token, config.verifyToken)) {
    logger.info('✅ Webhook verified');
    return res.status(200).send(challenge);
  }

  logger.warn({ mode }, '❌ Webhook verification failed');
  return res.sendStatus(403);
});

// ---------- POST /webhook — Event notifications ----------
router.post('/', verifySignature, (req, res) => {
  // ACK Meta immediately (must respond within 5s)
  res.sendStatus(200);

  // Process asynchronously — don't block the response
  setImmediate(() => {
    handleWebhookPayload(req.body);
  });
});

module.exports = router;