// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');

const { initTwilioAdapter } = require('./adapters/twilioAdapter');
const { initLiveKitAdapter } = require('./adapters/livekitAdapter');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const PROVIDER = (process.env.PROVIDER || 'twilio').toLowerCase();

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant dans .env');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

app.get('/', (_req, res) => {
  res.type('text').send(
    `Call2Food Voice Gateway (provider=${PROVIDER}, model=${OPENAI_REALTIME_MODEL}) OK`
  );
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
}

server.listen(PORT, () => {
  console.log(`✅ Provider = ${PROVIDER}`);
  console.log(`✅ Model = ${OPENAI_REALTIME_MODEL}`);
  console.log(`✅ Gateway listening on port ${PORT}`);
});
