// lib/geminiLive.js
const WebSocket = require("ws");

function createGeminiLiveSession({ apiKey, model }) {
  // Endpoint “Generative Language API” Live (AI Studio).
  // Si tu utilises Vertex AI à la place, il faudra adapter l’URL + auth.
  const url =
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;

  const ws = new WebSocket(url);

  const listeners = {
    text: [],
    audio: [],
  };

  function onText(cb) { listeners.text.push(cb); }
  function onAudio(cb) { listeners.audio.push(cb); }

  function send(obj) {
    ws.send(JSON.stringify(obj));
  }

  const ready = new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }

    // Parsing générique (à ajuster selon le schéma exact renvoyé)
    const candidates = msg?.candidates || msg?.response?.candidates;
    const parts = candidates?.[0]?.content?.parts;

    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (typeof p.text === "string") {
          for (const cb of listeners.text) cb(p.text);
        }
        if (p.inlineData?.mimeType?.startsWith("audio/") && p.inlineData?.data) {
          const audioBytes = Buffer.from(p.inlineData.data, "base64");
          for (const cb of listeners.audio) cb(audioBytes);
        }
      }
    }
  });

  async function start() {
    await ready;

    // Setup du modèle (schéma Live à adapter si besoin)
    send({
      setup: {
        model,
        generation_config: { response_modalities: ["AUDIO"] },
      },
    });
  }

  function sendAudioPcm16_16k(pcm16_16k_bytes) {
    // Live examples utilisent audio PCM avec un rate explicite :contentReference[oaicite:6]{index=6}
    send({
      client_content: {
        turns: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: "audio/pcm;rate=16000",
                  data: Buffer.from(pcm16_16k_bytes).toString("base64"),
                },
              },
            ],
          },
        ],
        turn_complete: false,
      },
    });
  }

  async function close() {
    try { ws.close(); } catch {}
  }

  return {
    start,
    sendAudioPcm16_16k,
    close,
    onText,
    onAudio,
  };
}

module.exports = { createGeminiLiveSession };
