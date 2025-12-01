// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');

const { initTwilioAdapter } = require('./adapters/twilioAdapter');
const { initLiveKitAdapter } = require('./adapters/livekitAdapter');

// === Variables ===
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const PROVIDER = (process.env.PROVIDER || 'twilio').toLowerCase();

// === Checks ===
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant');
  process.exit(1);
}

if (!['twilio', 'livekit'].includes(PROVIDER)) {
  console.error(`❌ PROVIDER inconnu: ${PROVIDER}`);
  process.exit(1);
}

// === Server ===
const app = express();
const server = http.createServer(app);

app.get('/', (_req, res) =>
  res.type('text').send(
    `Call2Food Voice Gateway — OK  
provider=${PROVIDER}  
model=${OPENAI_REALTIME_MODEL}`
  )
);

// === Adapter ===
if (PROVIDER === 'twilio') {
  initTwilioAdapter(server, {
    apiKey: OPENAI_API_KEY,
    model: OPENAI_REALTIME_MODEL,
  });
} else {
  initLiveKitAdapter(server, {
    apiKey: OPENAI_API_KEY,
    model: OPENAI_REALTIME_MODEL,
  });
}

server.listen(PORT, () => {
  console.log(`✅ Gateway listening on port ${PORT}`);
  console.log(`✅ Provider = ${PROVIDER}`);
  console.log(`✅ Model = ${OPENAI_REALTIME_MODEL}`);
});
