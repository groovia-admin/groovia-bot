const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Verify the X-Hub-Signature-256 header sent by Meta.
 * Requires express.json() to have populated req.rawBody.
 */
function verifySignature(req, res, next) {
  const signature = req.get('x-hub-signature-256');

  if (!signature) {
    logger.warn('Missing X-Hub-Signature-256 header');
    return res.status(401).send('Unauthorized');
  }

  if (!req.rawBody) {
    logger.error('Raw body not available for signature verification');
    return res.status(500).send('Server misconfiguration');
  }

  const expectedHash = crypto
    .createHmac('sha256', config.appSecret)
    .update(req.rawBody)
    .digest('hex');

  const receivedHash = signature.replace('sha256=', '');

  // Timing-safe comparison
  const valid =
    expectedHash.length === receivedHash.length &&
    crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(receivedHash, 'hex')
    );

  if (!valid) {
    logger.warn('Invalid webhook signature');
    return res.status(401).send('Unauthorized');
  }

  next();
}

module.exports = verifySignature;