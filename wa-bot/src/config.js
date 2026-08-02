require('dotenv').config();

// Everything here is a hard requirement for the bot to function at all —
// missing any of these previously degraded silently (e.g. shop/sender
// resolution just always failed) instead of failing at boot, which cost
// real production debugging time. Fail loudly instead.
const requiredEnv = [
  'VERIFY_TOKEN',
  'APP_SECRET',
  'WHATSAPP_TOKEN',
  'PHONE_NUMBER_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'INTERNAL_API_SECRET',
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`❌ Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  verifyToken: process.env.VERIFY_TOKEN,
  appSecret: process.env.APP_SECRET,
  whatsappToken: process.env.WHATSAPP_TOKEN,
  phoneNumberId: process.env.PHONE_NUMBER_ID,
  graphApiVersion: process.env.GRAPH_API_VERSION || 'v25.0',
  internalApiSecret: process.env.INTERNAL_API_SECRET,
};