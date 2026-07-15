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
