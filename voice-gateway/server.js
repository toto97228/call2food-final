// voice-gateway/server.js
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`✅ Voice Gateway WebSocket démarré sur ws://localhost:${PORT}`);
});

wss.on('connection', (ws) => {
  console.log('🔔 Nouvelle connexion WebSocket Twilio');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('📩 Event:', data.event);

      if (data.event === 'media') {
        console.log(
          '   → chunk audio reçu, taille base64 =',
          data.media.payload.length
        );
      }
    } catch (e) {
      console.log('📩 Message brut:', message.toString().slice(0, 200));
    }
  });

  ws.on('close', () => {
    console.log('❌ Connexion WebSocket fermée');
  });
});
