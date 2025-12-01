// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');

const { initTwilioAdapter } = require('./adapters/twilioAdapter');
const { initLiveKitAdapter } = require('./adapters/livekitAdapter');

// ==== Chargement des variables d'environnement ====
// OPENAI_API_KEY doit être présent dans .env
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ⚠️ IMPORTANT : le modèle Realtime DOIT être valide
// On utilise un modèle officiel 2025 compatible Realtime :
const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || 'gpt-real-time';

// Railway fournit automatiquement process.env.PORT
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

// twilio ou livekit
const PROVIDER = (process.env.PROVIDER || 'twilio').toLowerCase();

// ==== Vérifications ==== 
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant dans .env');
  process.exit(1);
}

if (!['twilio', 'livekit'].includes(PROVIDER)) {
  console.error(`❌ PROVIDER inconnu: ${PROVIDER} (utilise twilio ou livekit)`);
  process.exit(1);
}

// ==== Création du serveur HTTP ==== 
const app = express();
const server = http.createServer(app);

// Endpoint de test pour Railway
app.get('/', (_req, res) => {
  res
    .type('text')
    .send(`Call2Food Voice Gateway OK — provider=${PROVIDER} — model=${OPENAI_REALTIME_MODEL}`);
});

// ==== Initialisation de l'adapter ==== 
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

// ==== Démarrage ==== 
server.listen(PORT, () => {
  console.log(`✅ Gateway listening on port ${PORT}`);
  console.log(`✅ Provider = ${PROVIDER}`);
  console.log(`✅ Model = ${OPENAI_REALTIME_MODEL}`);
});
