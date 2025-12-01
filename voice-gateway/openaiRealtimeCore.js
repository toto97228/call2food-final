// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

function createOpenAIRealtimeSession({
  apiKey,
  model = 'gpt-4o-audio-preview-2024-12-17',
  onAudioDelta,
}) {
  // ✅ IMPORTANT : le modèle est passé dans l'URL
  const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
    model
  )}`;

  const ws = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  ws.on('open', () => {
    console.log('[OpenAI] WebSocket opened with model', model);

    // Ici on configure seulement les options, PAS le modèle
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          instructions:
            "Tu es l'assistant vocal Call2Eat. Parle français, réponses courtes.",
          voice: 'alloy',
        },
      })
    );
    console.log('[OpenAI] session.update envoyé');
  });

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

    // Audio de réponse → Twilio
    if (msg.type === 'response.audio.delta') {
      if (msg.delta && onAudioDelta) {
        onAudioDelta(msg.delta);
      }
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
  });

  // === Audio Twilio → OpenAI ===
  function appendAudio(ulawBase64) {
    // Sécurité : on ne pousse l'audio que si le WS est bien ouvert
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(
        '[OpenAI] appendAudio ignoré: WebSocket not OPEN (state =',
        ws.readyState,
        ')'
      );
      return;
    }

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
