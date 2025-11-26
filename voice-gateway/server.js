// server.js
require('dotenv').config();
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const {
  OPENAI_API_KEY,
  OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview',
  PORT = 3000,
} = process.env;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY manquant dans .env');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Healthcheck
app.get('/', (_req, res) => {
  res.type('text').send('Call2Food Twilio ↔ OpenAI gateway OK');
});

// WebSocket serveur (pour Twilio)
const twilioWss = new WebSocket.Server({ server });

twilioWss.on('connection', (twilioWs) => {
  console.log('[Twilio] WebSocket connected');

  const openaiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      OPENAI_REALTIME_MODEL
    )}`,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    }
  );

  let streamSid = null;

  openaiWs.on('open', () => {
    console.log('[OpenAI] Realtime WebSocket opened');

    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions:
          "Tu es un assistant de prise de commande pour un restaurant (pizzas, sushis, kebabs). " +
          'Pose des questions courtes, confirme la commande, puis récapitule.',
        voice: 'alloy',
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        turn_detection: { type: 'server_vad' },
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' }
      },
    };

    openaiWs.send(JSON.stringify(sessionUpdate));
  });

  openaiWs.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.error('[OpenAI] JSON parse error', e);
      return;
    }

    if (msg.type === 'response.audio.delta' && msg.delta && msg.delta.length) {
      if (!streamSid) return;

      const twilioMediaMsg = {
        event: 'media',
        streamSid,
        media: { payload: msg.delta },
      };

      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.send(JSON.stringify(twilioMediaMsg));
      }
    }

    if (msg.type === 'response.completed') {
      console.log('[OpenAI] Response completed');
    }
  });

  openaiWs.on('close', () => {
    console.log('[OpenAI] WebSocket closed');
  });

  openaiWs.on('error', (err) => {
    console.error('[OpenAI ERROR]', err);
  });

  twilioWs.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.error('[Twilio] JSON parse error', e);
      return;
    }

    switch (msg.event) {
      case 'connected':
        console.log('[Twilio] connected');
        break;
      case 'start':
        console.log('[Twilio] start');
        streamSid = msg.start.streamSid;
        break;
      case 'media':
        if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;
        const appendEvent = {
          type: 'input_audio_buffer.append',
          audio: msg.media.payload,
        };
        openaiWs.send(JSON.stringify(appendEvent));
        break;
      case 'mark':
        // rien ici, on laisse server_vad gérer
        break;
      case 'stop':
        console.log('[Twilio] stop, closing sockets');
        try {
          if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
        } catch (e) {
          console.error(e);
        }
        try {
          if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
        } catch (e) {
          console.error(e);
        }
        break;
      default:
        break;
    }
  });

  twilioWs.on('close', () => {
    console.log('[Twilio] WebSocket closed');
    try {
      if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    } catch (e) {
      console.error(e);
    }
  });

  twilioWs.on('error', (err) => {
    console.error('[Twilio ERROR]', err);
  });
});

server.listen(PORT, () => {
  console.log(`✅ Gateway listening on port ${PORT}`);
});
