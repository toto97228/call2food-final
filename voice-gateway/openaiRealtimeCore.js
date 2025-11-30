// voice-gateway/openaiRealtimeCore.js
const WebSocket = require('ws');

function createOpenAIRealtimeSession({ apiKey, model, onAudioDelta }) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${model}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    ws.on("open", () => {
      console.log("[OpenAI] WebSocket opened");

      // 1) Mise à jour session : format strict
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          instructions:
            "Tu es Call2Eat, un assistant vocal téléphonique. Parle français, phrases courtes.",
          audio: {
            input: {
              format: "pcm_mulaw",
              sample_rate: 8000,
              turn_detection: { type: "server_vad" }
            },
            output: {
              format: "pcm_mulaw",
              sample_rate: 8000,
              voice: "alloy"
            }
          }
        }
      }));

      console.log("[OpenAI] session.update envoyé");

      // 2) Création d'un item de conversation dans le bon format
      ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Dis uniquement : Bonjour, ici Call2Eat. Que souhaitez-vous commander ?"
            }
          ]
        }
      }));

      console.log("[OpenAI] conversation.item.create envoyé");

      // 3) Demande explicite de réponse vocale
      ws.send(JSON.stringify({
        type: "response.create"
      }));

      console.log("[OpenAI] response.create envoyé");

      resolve({
        ws,
        appendAudio: (base64Mulaw) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64Mulaw
          }));
        }
      });
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "response.output_audio.delta") {
        if (msg.delta && onAudioDelta) {
          console.log("[OpenAI] audio delta", msg.delta.length);
          onAudioDelta(msg.delta);
        }
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
