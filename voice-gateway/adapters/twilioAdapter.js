// adapters/twilioAdapter.js
const WebSocket = require('ws');
const { createOpenAIRealtimeSession } = require('../openaiRealtimeCore');

function initTwilioAdapter(server, { apiKey, model }) {
  // WebSocket server partagé avec HTTP (Railway)
  const twilioWss = new WebSocket.Server({ server });

  twilioWss.on('connection', async (twilioWs) => {
    console.log('[Twilio] WebSocket connected');

    let streamSid = null;

    // Création de la session Realtime OpenAI
    const session = await createOpenAIRealtimeSession({
      apiKey,
      model,
      onAudioDelta: (deltaBase64) => {
        if (!streamSid) return;
        if (twilioWs.readyState !== WebSocket.OPEN) return;

        console.log(
          '[Twilio] sending audio chunk to stream',
          streamSid,
          'size =',
          deltaBase64.length
        );

        const twilioMediaMsg = {
          event: 'media',
          streamSid,
          media: { payload: deltaBase64 },
        };

        // Audio IA → Twilio
        twilioWs.send(JSON.stringify(twilioMediaMsg));
      },
    });

    const openaiWs = session.ws;

    // Messages venant de Twilio (Media Streams)
    twilioWs.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        console.error('[Twilio] JSON parse error', e);
        return;
      }

      switch (msg.event) {
        case 'connected':
          console.log('[Twilio] connected');
          break;

        case 'start':
          console.log('[Twilio] start');
          streamSid = msg.start.streamSid;
          break;

        case 'media':
          // audio Twilio (g711 μ-law base64) → OpenAI
          session.appendAudio(msg.media.payload);
          break;

        case 'mark':
          // pas utilisé pour l’instant
          break;

        case 'stop':
          console.log('[Twilio] stop, closing sockets');
          cleanup();
          break;

        default:
          break;
      }
    });

    const cleanup = () => {
      try {
        if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
      } catch (e) {
        console.error(e);
      }
      try {
        if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
      } catch (e) {
        console.error(e);
      }
    };

    twilioWs.on('close', () => {
      console.log('[Twilio] WebSocket closed');
      cleanup();
    });

    twilioWs.on('error', (err) => {
      console.error('[Twilio ERROR]', err);
      cleanup();
    });
  });

  console.log('✅ Twilio adapter initialised');
}

module.exports = { initTwilioAdapter };

