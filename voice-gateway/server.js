// voice-gateway/server.js
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

// ------------------------------
// 🔑 OpenAI Realtime Client
// ------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ------------------------------
// 🔌 Serveur WebSocket Railway
// ------------------------------
const wss = new WebSocketServer({
  port: process.env.PORT || 8080,
});

console.log("🚀 Voice Gateway WebSocket READY on port", process.env.PORT || 8080);

// -------------------------------------------
// 📡 Gestion connexion Twilio -> Serveur
// -------------------------------------------
wss.on("connection", (ws) => {
  console.log("📞 Nouvelle connexion WebSocket Twilio");

  // ------------------------------
  // 🔥 Connexion OpenAI Realtime WS
  // ------------------------------
  const ai = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  // Logs OpenAI
  ai.on("open", () => console.log("🟢 CONNECTED to OpenAI Realtime"));
  ai.on("close", () => console.log("🟡 OpenAI WebSocket CLOSED"));
  ai.on("error", (err) => console.log("🔴 OpenAI ERROR:", err));

  // ----------------------------------------
  // 🎧 Twilio → OpenAI (Audio Input)
  // ----------------------------------------
  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.event === "media") {
        const audio = data.media.payload;

        console.log("🎵 chunk audio reçu, taille =", audio.length);

        // Envoi du chunk audio vers OpenAI
        ai.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: audio,
          })
        );
      }

      if (data.event === "stop") {
        console.log("🛑 Fin du Stream Twilio → Ask OpenAI to respond");

        ai.send(
          JSON.stringify({
            type: "input_audio_buffer.commit",
          })
        );

        ai.send(
          JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
            },
          })
        );
      }
    } catch (e) {
      console.log("⚠️ Erreur parsing Twilio message:", e);
    }
  });

  // ----------------------------------------
  // 🔊 OpenAI → Twilio (Audio Output)
  // ----------------------------------------
  ai.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "response.output_text.delta") {
      console.log("📝 Texte OpenAI:", data.text);
    }

    if (data.type === "response.audio.delta") {
      console.log("🔊 Audio OpenAI -> Twilio (chunk)");

      ws.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: data.audio, // Base64 audio
          },
        })
      );
    }

    if (data.type === "response.completed") {
      console.log("✅ Réponse OpenAI terminée");
    }
  });

  ws.on("close", () => {
    console.log("❌ Connexion WebSocket Twilio fermée");
    ai.close();
  });
});
