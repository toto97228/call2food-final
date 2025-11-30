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

      // 1) Mise à jour de la session (format conforme à la doc Realtime)
      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            // le modèle
            model,
            // on veut texte + audio
            modalities: ['audio', 'text'],
            // voix TTS
            voice: 'alloy',
            // formats audio d’entrée/sortie compatibles Twilio (G.711 μ-law)
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            // VAD côté serveur pour détecter les tours de parole
            turn_detection: { type: 'server_vad' },
            instructions:
              "Tu es l'assistant vocal Call2Eat pour un food truck. " +
              'Tu parles français, réponses très courtes, et tu poses une question à la fois.',
          },
        })
      );

      console.log('[OpenAI] session.update envoyé');

      // 2) Demande d’une réponse vocale de bienvenue
      ws.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            // combinaisons supportées : ['text'] ou ['audio','text']
            modalities: ['audio', 'text'],
            instructions:
              'Dis exactement en français : "Bonjour, ici Call2Eat. Que souhaitez-vous commander, pizza ou sushi ?"',
          },
        })
      );

      console.log('[OpenAI] response.create (greeting) envoyé');

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

      // Important : nouveau nom d’event Realtime
      if (msg.type === 'response.output_audio.delta' && msg.delta) {
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
