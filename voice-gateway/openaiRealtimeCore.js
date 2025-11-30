// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

/**
 * Crée une session Realtime avec OpenAI et renvoie :
 * - ws : le WebSocket brut
 * - appendAudio(base64ulaw) : pour pousser l'audio Twilio vers OpenAI
 */
async function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY manquant');
  }

  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
    model
  )}`;

  return new Promise((resolve, reject) => {
    const openaiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    let isOpen = false;

    openaiWs.on('open', () => {
      isOpen = true;
      console.log('[OpenAI] WebSocket opened');

      // 1) Configuration de la session
      const sessionUpdate = {
        type: 'session.update',
        session: {
          // Twilio envoie du G.711 µ-law 8kHz
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          // VAD côté serveur pour détecter les tours de parole
          turn_detection: { type: 'server_vad' },
          // Optionnel mais utile pour récupérer le texte si besoin
          input_audio_transcription: {
            model: 'gpt-4o-transcribe',
          },
          instructions:
            "Tu es l'assistant vocal du food truck Call2Eat. " +
            "Tu prends les commandes de pizzas et sushis, tu poses des questions simples " +
            "et tu restes très concis.",
        },
      };
      openaiWs.send(JSON.stringify(sessionUpdate));

      // 2) Faire parler l'IA en premier
      const initialResponse = {
        type: 'response.create',
        response: {
          instructions:
            "Salue le client, présente Call2Eat en une phrase, " +
            "et demande-lui ce qu'il souhaite commander.",
        },
      };
      openaiWs.send(JSON.stringify(initialResponse));

      // Fonction utilisée par le twilioAdapter pour pousser l'audio du caller
      const appendAudio = (base64ulaw) => {
        if (openaiWs.readyState !== WebSocket.OPEN) return;

        openaiWs.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64ulaw,
          })
        );
      };

      resolve({ ws: openaiWs, appendAudio });
    });

    // 3) Gestion des messages venant d'OpenAI
    openaiWs.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      // Audio à renvoyer à Twilio
      if (msg.type === 'response.audio.delta' && msg.delta) {
        if (typeof onAudioDelta === 'function') {
          onAudioDelta(msg.delta);
        }
      }

      // Logs utiles
      if (msg.type === 'response.completed') {
        console.log('[OpenAI] response completed');
      }
      if (msg.type === 'error') {
        console.error('[OpenAI ERROR]', msg);
      }
    });

    openaiWs.on('close', (code, reason) => {
      console.log(
        '[OpenAI] WebSocket closed',
        code,
        reason ? reason.toString() : ''
      );
      if (!isOpen) {
        // Fermeture pendant la connexion initiale
        reject(new Error(`OpenAI WS closed before ready: ${code}`));
      }
    });

    openaiWs.on('error', (err) => {
      console.error('[OpenAI] WebSocket error', err);
      if (!isOpen) reject(err);
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
