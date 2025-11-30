// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');

const { initTwilioAdapter } = require('./adapters/twilioAdapter');
const { initLiveKitAdapter } = require('./adapters/livekitAdapter');

// ==== Chargement des variables d'environnement ====
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';

// ⚠️ IMPORTANT pour Railway : on respecte toujours process.env.PORT
// Railway fournit PORT automatiquement. En local, on tombe sur 8080.
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

// Choix du provider : "twilio" ou "livekit"
const PROVIDER = (process.env.PROVIDER || 'twilio').toLowerCase();

// ==== Vérifications de base ====
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant dans .env');
  process.exit(1);
}

if (!['twilio', 'livekit'].includes(PROVIDER)) {
  console.error(`❌ PROVIDER inconnu: ${PROVIDER} (utilise "twilio" ou "livekit")`);
}

// ==== Création du serveur HTTP / Express ====
const app = express();
const server = http.createServer(app);

// Petit endpoint de santé pour vérifier que la gateway tourne
app.get('/', (_req, res) => {
  res
    .type('text')
    .send(`Call2Food Voice Gateway (provider=${PROVIDER}) OK`);
});

// ==== Initialisation de l'adapter selon le provider ====
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

// ==== Démarrage du serveur ====
server.listen(PORT, () => {
  console.log(`✅ Twilio adapter initialised (provider=${PROVIDER})`);
  console.log(`✅ Gateway listening on port ${PORT}`);
});
