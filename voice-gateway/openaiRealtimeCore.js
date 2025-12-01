// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

/**
 * Crée une session Realtime OpenAI et renvoie :
 *  - ws  : le WebSocket brut
 *  - appendAudio(base64Mulaw) : pour envoyer l'audio Twilio
 */
function createOpenAIRealtimeSession({
  apiKey,
  model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17',
  onAudioDelta,
}) {
  return new Promise((resolve, reject) => {
    // ✅ le modèle est passé dans l’URL comme demandé par OpenAI
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      model
    )}`;

    console.log('[OpenAI] connexion WebSocket vers', url);

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    let isOpen = false;

    ws.on('open', () => {
      isOpen = true;
      console.log('[OpenAI] WebSocket opened with model', model);

      // configuration de la session
      const sessionUpdate = {
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          instructions:
            "Tu es l'assistant vocal Call2Eat. Parle français, réponses courtes.",
          voice: 'alloy',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      };

      ws.send(JSON.stringify(sessionUpdate));
      console.log('[OpenAI] session.update envoyé');

      // message de bienvenue (texte → réponse audio)
      const greetingItem = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: "Salue le client de Call2Eat et demande-lui ce qu'il veut commander.",
            },
          ],
        },
      };
      ws.send(JSON.stringify(greetingItem));
      console.log('[OpenAI] conversation.item.create envoyé');

      const createResponse = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: "Réponds toujours en français, de manière courte.",
        },
      };
      ws.send(JSON.stringify(createResponse));
      console.log('[OpenAI] response.create envoyé');

      // fonction pour envoyer l'audio Twilio vers OpenAI
      const appendAudio = (base64Mulaw) => {
        if (!isOpen || ws.readyState !== WebSocket.OPEN) {
          console.log(
            '[OpenAI] appendAudio ignoré: WebSocket not OPEN (state =',
            ws.readyState,
            ')'
          );
          return;
        }

        const event = {
          type: 'input_audio_buffer.append',
          audio: base64Mulaw, // Twilio envoie déjà du g711 μ-law en base64
        };
        ws.send(JSON.stringify(event));
      };

      resolve({ ws, appendAudio });
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        console.error('[OpenAI] JSON parse error', e);
        return;
      }

      if (msg.type && msg.type.startsWith('response.')) {
        console.log('[OpenAI EVENT]', msg.type, JSON.stringify(msg).slice(0, 300));
      }

      // audio de sortie
      if (msg.type === 'response.audio.delta' && msg.delta && onAudioDelta) {
        onAudioDelta(msg.delta);
      }

      if (msg.type === 'error') {
        console.error('[OpenAI ERROR]', msg);
      }
    });

    ws.on('close', (code, reason) => {
      isOpen = false;
      console.log('[OpenAI] WebSocket closed', code, reason?.toString());
    });

    ws.on('error', (err) => {
      console.error('[OpenAI] WebSocket ERROR', err);
      if (!isOpen) reject(err);
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
