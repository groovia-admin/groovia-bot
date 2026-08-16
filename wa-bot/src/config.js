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
  // Promoted from optional to required: the ordering webview this used to
  // point at "doesn't exist yet" when that comment was first written —
  // it's now the only live customer ordering path there is (the native
  // WhatsApp-catalog flow was superseded and is unreachable from the
  // webhook router). Missing this used to degrade silently, one customer
  // at a time, each getting "online ordering is launching soon" forever —
  // total ordering outage with nothing at boot to say why.
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