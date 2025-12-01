// voice-gateway/server.js
require('dotenv').config();
const http = require('http');
const express = require('express');

const { initTwilioAdapter } = require('./adapters/twilioAdapter');
const { initLiveKitAdapter } = require('./adapters/livekitAdapter');

// ====== ENV ======
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ⚠️ ICI : on lit le modèle depuis l'ENV, avec un fallback audio correct
const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-audio-preview-2024-12-17';

// Railway fournit PORT automatiquement. Local : 8080
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

const PROVIDER = (process.env.PROVIDER || 'twilio').toLowerCase();

// ====== CHECKS ======
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant dans les variables d’environnement');
  process.exit(1);
}

if (!['twilio', 'livekit'].includes(PROVIDER)) {
  console.error(`❌ PROVIDER inconnu: ${PROVIDER} (utilise "twilio" ou "livekit")`);
}

// ====== HTTP SERVER ======
const app = express();
const server = http.createServer(app);

app.get('/', (_req, res) => {
  res
    .type('text')
    .send(`Call2Food Voice Gateway (provider=${PROVIDER}, model=${OPENAI_REALTIME_MODEL}) OK`);
});

// ====== INIT ADAPTER ======
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

// ====== START ======
server.listen(PORT, () => {
  console.log(`✅ Provider = ${PROVIDER}`);
  console.log(`✅ Model = ${OPENAI_REALTIME_MODEL}`);
  console.log(`✅ Gateway listening on port ${PORT}`);
});
