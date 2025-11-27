// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');

const { initTwilioAdapter } = require('./adapters/twilioAdapter');
const { initLiveKitAdapter } = require('./adapters/livekitAdapter');

const {
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview',
  PORT = 8080,
  PROVIDER = 'twilio', // 'twilio' ou 'livekit'
} = process.env;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant dans .env');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

app.get('/', (_req, res) => {
  res.type('text').send(`Call2Food Voice Gateway (${PROVIDER}) OK`);
});

if (PROVIDER === 'twilio') {
  initTwilioAdapter(server, {
    apiKey: OPENAI_API_KEY,
    model: OPENAI_REALTIME_MODEL,
  });
} else if (PROVIDER === 'livekit') {
  initLiveKitAdapter(server, {
    apiKey: OPENAI_API_KEY,
    model: OPENAI_REALTIME_MODEL,
  });
} else {
  console.error(`❌ PROVIDER inconnu: ${PROVIDER}`);
}

server.listen(PORT, () => {
  console.log(`✅ Gateway listening on port ${PORT} (provider=${PROVIDER})`);
});
