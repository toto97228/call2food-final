// voice-gateway/server.js

const WebSocket = require('ws');

const PORT = 8080;

// Création du serveur WebSocket
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`✅ Voice Gateway WebSocket démarré sur ws://localhost:${PORT}`);
});

// Quand Twilio (ou un client) se connecte
wss.on('connection', (ws, req) => {
  console.log('🔔 Nouvelle connexion WebSocket reçue');

  ws.on('message', (message) => {
    // Twilio enverra du JSON texte
    try {
      const data = JSON.parse(message.toString());
      console.log('📩 Message reçu :', data);
    } catch (e) {
      console.log('📩 Message brut reçu :', message.toString());
    }
  });

  ws.on('close', () => {
    console.log('❌ Connexion WebSocket fermée');
  });
});
