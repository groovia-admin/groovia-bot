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
  // Promoted from optional: this used to silently degrade every
  // customer to a generic "ordering is launching soon" message with no
  // error, no log, nothing to say why -- fine when the webview was an
  // unfinished feature nothing depended on yet, wrong now that it's the
  // only way a customer can actually place an order. A crash at boot
  // that gets noticed and fixed immediately beats a silent outage that
  // might not be.
  'WEBVIEW_BASE_URL',
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
  webviewBaseUrl: process.env.WEBVIEW_BASE_URL,
  // Deliberately NOT in requiredEnv, same reasoning as webviewBaseUrl —
  // the staff welcome message (messageHandler.js) still sends fine
  // without it, just with a generic line instead of a real link. Same
  // value as the dashboard's own NEXT_PUBLIC_SITE_URL env var, copied
  // here because wa-bot and the dashboard are separate deployments with
  // no shared config.
  dashboardUrl: process.env.DASHBOARD_URL || null,
};