const crypto = require('crypto');

// Constant-time string compare — prevents a timing side-channel on secret
// comparisons (webhook verify token, internal API shared secret).
function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));

  if (bufA.length !== bufB.length) return false;

  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { timingSafeEqualStrings };
