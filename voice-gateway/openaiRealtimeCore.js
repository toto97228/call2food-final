// openaiRealtimeCore.js
const WebSocket = require('ws');

const REALTIME_URL = 'wss://api.openai.com/v1/realtime';

/**
 * Crée une session Realtime OpenAI.
 * - Envoie un message vocal de bienvenue dès l'ouverture.
 * - Permet d'envoyer l'audio Twilio vers OpenAI via appendAudio().
 * - Renvoie les chunks audio via onAudioDelta (base64 G.711 μ-law).
 */
function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY manquant');
  }

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
      appendAudio(base64Mulaw) {
        if (ws.readyState !== WebSocket.OPEN) return;

        ws.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Mulaw,
          })
        );
      },
      close() {
        try {
          ws.close();
        } catch (_e) {}
      },
    };

    ws.on('open', () => {
      console.log('[OpenAI] WebSocket opened');

      // 1) Configuration de la session : on demande explicitement de l'audio
      const sessionUpdate = {
        type: 'session.update',
        session: {
          model,
          voice: 'alloy',
          modalities: ['audio'], // on ne veut que de l'audio au début
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          instructions:
            "Tu es l'assistant vocal du food truck Call2Eat. " +
            "Tu parles en français, très court et clair.",
        },
      };
      ws.send(JSON.stringify(sessionUpdate));

      // 2) Premier message vocal forcé : phrase de bienvenue
      const greet = {
        type: 'response.create',
        response: {
          modalities: ['audio'], // on force la sortie audio
          instructions:
            'Dis exactement: "Bonjour, bienvenue chez Call2Eat. Que souhaitez-vous commander, pizza ou sushi ?" en français.',
        },
      };
      ws.send(JSON.stringify(greet));

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

      if (msg.type === 'response.audio.delta' && msg.delta) {
        console.log('[OpenAI] audio delta size =', msg.delta.length);
        if (typeof onAudioDelta === 'function') {
          onAudioDelta(msg.delta);
        }
      } else if (msg.type === 'response.completed') {
        console.log('[OpenAI] response completed');
      } else if (msg.type === 'error') {
        console.error('[OpenAI ERROR]', msg.error || msg);
      } else {
        // autres events ignorés pour l'instant
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
