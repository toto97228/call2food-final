// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

/**
 * Crée une session Realtime OpenAI et renvoie :
 * - ws : le WebSocket ouvert
 * - appendAudio(base64Ulaw) : pour envoyer l'audio Twilio (G.711 μ-law base64)
 */
function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY manquant');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );

    ws.on('open', () => {
      console.log('[OpenAI] WebSocket opened');

      // 1) Mise à jour de la session : audio + texte, µ-law, VAD serveur
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            model,
            modalities: ['audio', 'text'],
            voice: 'alloy',
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            turn_detection: { type: 'server_vad' },
            instructions:
              "Tu es l'assistant vocal Call2Eat pour un food truck. " +
              'Tu parles français, réponses très courtes, et tu poses une question à la fois.',
          },
        })
      );
      console.log('[OpenAI] session.update envoyé');

      // 2) On ajoute un item de conversation pour forcer un greeting
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  "Salue le client de Call2Eat et demande-lui ce qu'il veut commander, pizza ou sushi.",
              },
            ],
          },
        })
      );
      console.log('[OpenAI] conversation.item.create envoyé');

      // 3) On demande explicitement une réponse
      ws.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['audio', 'text'],
          },
        })
      );
      console.log('[OpenAI] response.create envoyé');

      // Objet retourné au twilioAdapter
      resolve({
        ws,
        appendAudio: (base64Ulaw) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          ws.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Ulaw,
            })
          );
        },
      });
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        console.error('[OpenAI] JSON parse error', e);
        return;
      }

      // ⚠️ C'est BIEN response.audio.delta (et pas response.output_audio.delta)
      if (msg.type === 'response.audio.delta' && msg.delta) {
        console.log('[OpenAI] audio delta size =', msg.delta.length);
        if (typeof onAudioDelta === 'function') {
          onAudioDelta(msg.delta);
        }
      }

      if (msg.type === 'response.completed') {
        console.log('[OpenAI] response.completed');
      }

      if (msg.type === 'error') {
        console.error('[OpenAI ERROR]', msg);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(
        '[OpenAI] WebSocket closed',
        code,
        reason ? reason.toString() : ''
      );
    });

    ws.on('error', (err) => {
      console.error('[OpenAI WS ERROR]', err);
      reject(err);
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
