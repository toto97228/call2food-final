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

      // Event principal (start / media / stop, etc.)
      console.log('📩 Event:', data.event);

      if (data.event === 'start') {
        console.log('   → Stream démarré pour appel', data.start?.callSid);
      }

      if (data.event === 'media') {
        console.log(
          '   → chunk audio reçu, taille base64 =',
          data.media.payload.length
        );
      }

      if (data.event === 'stop') {
        console.log('   → Stream terminé');
      }
    } catch (e) {
      console.log('📩 Message non JSON:', message.toString().slice(0, 200));
    }
  });

  ws.on('close', () => {
    console.log('❌ Connexion WebSocket fermée');
  });
});
