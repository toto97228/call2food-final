// voice-gateway/openaiRealtimeCore.js
const WebSocket = require("ws");

function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://api.openai.com/v1/realtime", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("open", () => {
      console.log("[OpenAI] WebSocket opened");

      // === Configure la session ===
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            model, // <== le modèle vient du .env / server.js
            modalities: ["audio", "text"],
            instructions:
              "Tu es l'assistant vocal Call2Eat. Parle français, phrases courtes et directes.",
            voice: "alloy",
          },
        })
      );
      console.log("[OpenAI] session.update envoyé");

      resolve({
        ws,
        appendAudio: (base64Audio) => {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64Audio,
            })
          );
        },

        commitAudio: () => {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.commit",
            })
          );
        },
      });
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (e) {
        console.error("[OpenAI] JSON parse error", e, data);
        return;
      }

      // Log tous les events OpenAI
      if (msg.type) {
        console.log("[OpenAI EVENT]", msg.type, JSON.stringify(msg));
      }

      // === Événements audio ===
      if (msg.type === "response.audio.delta" && msg.delta) {
        if (onAudioDelta) {
          onAudioDelta(msg.delta);
        }
      }

      if (msg.type === "response.done") {
        console.log("[OpenAI] Réponse terminée");
      }
    });

    ws.on("error", (err) => {
      console.error("[OpenAI ERROR]", err);
      reject(err);
    });

    ws.on("close", (code, reason) => {
      console.log(`[OpenAI] WebSocket closed ${code} ${reason || ""}`);
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
