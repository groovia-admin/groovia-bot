const express = require('express');
const app = express();

// Crucial: This middleware allows your app to read incoming JSON payloads from Meta
app.use(express.json()); 

// --- HEALTH CHECK ROUTES ---
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'Groovia Bot',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Groovia WhatsApp Bot is running'
  });
});


// --- META WEBHOOK ROUTES (ADD THIS) ---

// 1. GET Route: For verification (This fixes your Meta Dashboard error)
app.get('/webhook', (req, res) => {
  // Pulls the token from your Railway Environment Variables
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'sdlfkmsldkfm'; 

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook successfully verified with Meta!');
    return res.status(200).send(challenge); // Send back the challenge string to Meta
  } else {
    console.log('❌ Webhook verification failed. Token mismatch.');
    return res.sendStatus(403); // Forbidden
  }
});

// 2. POST Route: To receive messages/status updates from WhatsApp
app.post('/webhook', (req, res) => {
  const body = req.body;

  // Log incoming messages to your Railway console
  console.log('📩 Incoming Webhook Payload:', JSON.stringify(body, null, 2));

  if (body.object) {
    // Return a 200 OK to Meta so they know you successfully received the data
    return res.status(200).send('EVENT_RECEIVED');
  } else {
    // Return a 404 if the event is not from WhatsApp API
    return res.sendStatus(404);
  }
});


// --- SERVER PORT CONFIGURATION ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
