// openaiRealtimeCore.js
const WebSocket = require('ws');

const REALTIME_URL = 'wss://api.openai.com/v1/realtime';

/**
 * Crée une session Realtime OpenAI.
 * @param {Object} params
 * @param {string} params.apiKey - Clé API OpenAI (venant de process.env.OPENAI_API_KEY)
 * @param {string} params.model  - Nom du modèle Realtime (ex: gpt-4o-realtime-preview)
 * @param {function} params.onAudioDelta - callback(base64G711) appelé à chaque chunk audio
 */
function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${REALTIME_URL}?model=${encodeURIComponent(model)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );

    const session = {
      ws,
      /**
       * Envoie de l’audio G.711 μ-law (Twilio) vers OpenAI, encodé en base64.
       */
      appendAudio(base64Mulaw) {
        if (ws.readyState !== WebSocket.OPEN) return;

        ws.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Mulaw,
          })
        );
        // On laisse le VAD serveur décider quand la phrase est terminée.
      },
      close() {
        try {
          ws.close();
        } catch (_e) {}
      },
    };

    ws.on('open', () => {
      console.log('[OpenAI] WebSocket opened');

      // Configuration de la session Realtime
      const sessionUpdate = {
        type: 'session.update',
        session: {
          model,
          voice: 'alloy',
          modalities: ['text', 'audio'],
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          instructions:
            "Tu es Call2Eat, un assistant de prise de commande pour un food truck. " +
            "Parle en français, phrases courtes, ton chaleureux. " +
            'Pose une question à la fois. Demande les pizzas ou sushis, puis les détails de la commande.',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      };

      ws.send(JSON.stringify(sessionUpdate));

      // Premier message vocal immédiat (greeting)
      ws.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            instructions:
              'Dis juste: "Bonjour, vous voulez plutôt pizza ou sushi ?" en français.',
          },
        })
      );

      resolve(session);
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        console.error('[OpenAI] JSON parse error', e);
        return;
      }

      switch (msg.type) {
        case 'response.audio.delta':
          if (msg.delta && onAudioDelta) {
            console.log(
              '[OpenAI] audio delta size =',
              msg.delta.length
            );
            onAudioDelta(msg.delta);
          }
          break;

        case 'response.completed':
          console.log(
            '[OpenAI] response completed',
            msg.response && msg.response.id
          );
          break;

        case 'input_audio_buffer.speech_started':
          console.log('[OpenAI] speech started');
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[OpenAI] speech stopped, asking for reply');
          // Quand OpenAI détecte la fin de ta phrase, on demande une réponse
          ws.send(JSON.stringify({ type: 'response.create' }));
          break;

        case 'error':
          console.error('[OpenAI ERROR]', msg.error || msg);
          break;

        default:
        // autres événements ignorés pour l’instant
      }
    });

    ws.on('close', (code, reason) => {
      console.log('[OpenAI] WebSocket closed', code, reason.toString());
    });

    ws.on('error', (err) => {
      console.error('[OpenAI WS ERROR]', err);
      reject(err);
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
