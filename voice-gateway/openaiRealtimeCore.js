// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${model}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    ws.on('open', () => {
      console.log('[OpenAI] WebSocket opened');

      // 1) Config de la session (audio + voix + VAD)
      const sessionUpdate = {
        type: 'session.update',
        session: {
          type: 'realtime',
          model,
          output_modalities: ['audio'], // le modèle doit générer de l’audio
          audio: {
            input: {
              format: { type: 'audio/pcmu' }, // Twilio = G.711 μ-law (PCMU)
              turn_detection: { type: 'server_vad' },
            },
            output: {
              format: { type: 'audio/pcmu' },
              voice: 'alloy',
            },
          },
          instructions:
            "Tu es Call2Eat, un assistant téléphonique pour prendre des commandes de pizza et sushi pour un food truck. " +
            "Tu parles en français, tu restes très court dans tes réponses, et tu poses une question à la fois.",
        },
      };

      ws.send(JSON.stringify(sessionUpdate));
      console.log('[OpenAI] session.update envoyé');

      // 2) Message de bienvenue (le bot parle en premier)
      const initialConversationItem = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                "Dis : « Bonjour, ici Call2Eat. Je peux prendre ta commande de pizzas ou de sushis. Qu'est-ce que tu veux manger ? »",
            },
          ],
        },
      };

      ws.send(JSON.stringify(initialConversationItem));
      console.log('[OpenAI] conversation.item.create (greeting) envoyé');

      // 3) Demande explicite de réponse
      ws.send(JSON.stringify({ type: 'response.create' }));
      console.log('[OpenAI] response.create envoyé');

      // Objet retourné au twilioAdapter
      resolve({
        ws,
        appendAudio: (base64Ulaw) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const msg = {
            type: 'input_audio_buffer.append',
            audio: base64Ulaw,
          };
          ws.send(JSON.stringify(msg));
        },
      });
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        console.error('[OpenAI] JSON parse error', e, data.toString());
        return;
      }

      // Log minimal
      if (msg.type === 'error') {
        console.error('[OpenAI ERROR]', msg);
      } else if (msg.type === 'response.output_audio.delta') {
        // Audio sortant vers Twilio
        if (msg.delta && onAudioDelta) {
          onAudioDelta(msg.delta);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[OpenAI ERROR]', err);
      reject(err);
    });

    ws.on('close', (code, reason) => {
      console.log('[OpenAI] WebSocket closed', code, reason.toString());
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
