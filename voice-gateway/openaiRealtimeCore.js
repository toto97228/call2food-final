// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

/**
 * Crée une session Realtime OpenAI et renvoie :
 *   - ws : le WebSocket OpenAI brut
 *   - appendAudio(base64) : pour envoyer l'audio (G711 μ-law base64)
 *   - close() : pour fermer proprement la session
 */
function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
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

      const sessionUpdate = {
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          instructions:
            "Tu es un assistant de prise de commande pour un restaurant (pizzas, sushis, kebabs). " +
            'Pose des questions courtes, confirme la commande, puis fais un récapitulatif.',
          voice: 'alloy',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: { type: 'server_vad' },
          input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
        },
      };

      ws.send(JSON.stringify(sessionUpdate));

      // On renvoie au caller un petit wrapper pratique
      resolve({
        ws,
        appendAudio: (base64Audio) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const evt = {
            type: 'input_audio_buffer.append',
            audio: base64Audio,
          };
          ws.send(JSON.stringify(evt));
        },
        close: () => {
          try {
            ws.close();
          } catch (e) {
            console.error(e);
          }
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

      // 🔊 Audio de sortie → on le renvoie vers Twilio / LiveKit
      if (msg.type === 'response.audio.delta' && msg.delta && msg.delta.length) {
        onAudioDelta?.(msg.delta);
      }

      // Utile pour debug
      if (msg.type === 'response.completed') {
        console.log('[OpenAI] Response completed');
      }
    });

    ws.on('error', (err) => {
      console.error('[OpenAI ERROR]', err);
      reject(err);
    });

    ws.on('close', () => {
      console.log('[OpenAI] WebSocket closed');
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
// ⚠️ Pas d'appel à aiOrderParser ici : la création de commande est faite côté Next.js
