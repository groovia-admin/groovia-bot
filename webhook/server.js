const express = require('express');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Groovia Bot',
    timestamp: new Date().toISOString()
  });
});

// Root route (optional, for browser test)
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Groovia WhatsApp Bot is running' });
});

// ✅ Meta Webhook Verification (GET)
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Verification failed');
    res.status(403).end();
  }
});

// ✅ Meta Webhook Messages (POST)
app.post('/webhook', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n📩 Webhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).end();
});

app.listen(port, () => {
  console.log(`\n🚀 Listening on port ${port}\n`);
});
