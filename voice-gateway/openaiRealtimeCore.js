// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    ws.on("open", () => {
      console.log("[OpenAI] WebSocket opened");

      // --- 1) UPDATE SESSION ---
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          model,
          modalities: ["audio", "text"],
          voice: "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },
          instructions:
            "Tu es l'assistant vocal du food truck Call2Eat. Parle français brièvement."
        }
      }));
      console.log("[OpenAI] session.update envoyé");

      // --- 2) PREMIER ITEM DE CONVERSATION ---
      ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Bonjour, peux-tu saluer le client de Call2Eat et lui demander ce qu'il veut commander ?"
            }
          ]
        }
      }));
      console.log("[OpenAI] conversation.item.create envoyé");

      // --- 3) DEMANDER LA RÉPONSE ---
      ws.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"]
        }
      }));
      console.log("[OpenAI] response.create envoyé");

      // --- Fournir appendAudio() au twilioAdapter ---
      resolve({
        ws,
        appendAudio: (base64Ulaw) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          ws.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64Ulaw
          }));
        }
      });
    });

    ws.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); }
      catch { return; }

      if (msg.type === "response.output_audio.delta") {
        console.log("[OpenAI] audio delta size =", msg.delta.length);
        if (onAudioDelta) onAudioDelta(msg.delta);
      }

      if (msg.type === "response.completed") {
        console.log("[OpenAI] response.completed");
      }

      if (msg.type === "error") {
        console.error("[OpenAI ERROR]", msg);
      }
    });

    ws.on("close", (code, reason) => {
      console.log("[OpenAI] WebSocket closed", code, reason.toString());
    });

    ws.on("error", (err) => {
      console.error("[OpenAI WS ERROR]", err);
      reject(err);
    });
  });
}

module.exports = { createOpenAIRealtimeSession };
