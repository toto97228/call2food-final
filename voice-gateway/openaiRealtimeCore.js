// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

function createOpenAIRealtimeSession({
  apiKey,
  model = 'gpt-4o-audio-preview-2024-12-17', // fallback audio correct
  onAudioDelta,
}) {
  const ws = new WebSocket('wss://api.openai.com/v1/realtime', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  ws.on('open', () => {
    console.log('[OpenAI] WebSocket opened');

    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          model, // ← on utilise bien le paramètre
          modalities: ['audio', 'text'],
          instructions:
            "Tu es l'assistant vocal Call2Eat. Parle français, réponses courtes.",
          voice: 'alloy',
        },
      })
    );
    console.log('[OpenAI] session.update envoyé');
  });

  // Réception des events venant d’OpenAI
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.error('[OpenAI] JSON parse error', e);
      return;
    }

    const short = JSON.stringify(msg).slice(0, 200);
    console.log('[OpenAI EVENT]', msg.type, short);

    // Audio sortant
    if (msg.type === 'response.audio.delta') {
      if (msg.delta && onAudioDelta) {
        onAudioDelta(msg.delta);
      }
    }

    // Erreurs
    if (msg.type === 'error') {
      console.error('[OpenAI ERROR]', msg);
    }
  });

  ws.on('close', (code, reason) => {
    console.log('[OpenAI] WebSocket closed', code, reason?.toString());
  });

  ws.on('error', (err) => {
    console.error('[OpenAI WS ERROR]', err);
  });

  // Fonction appelée par Twilio pour pousser l’audio entrant
  function appendAudio(ulawBase64) {
    ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: ulawBase64,
      })
    );
  }

  return {
    ws,
    appendAudio,
  };
}

module.exports = { createOpenAIRealtimeSession };
