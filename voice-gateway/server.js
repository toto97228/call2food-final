// voice-gateway/server.js

import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---- Serveur WebSocket Railway (pour Twilio) ----
const wss = new WebSocketServer({ port: PORT });
console.log("🚀 Voice Gateway WebSocket READY on port", PORT);

// ---- Connexion OpenAI Realtime ----
function connectOpenAI() {
  return new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );
}

// ---- Gestion des connexions Twilio ----
wss.on("connection", async (twilioWs) => {
  console.log("🔔 Nouvelle connexion WebSocket Twilio");

  // Connexion au serveur OpenAI
  const ai = connectOpenAI();

  ai.on("open", () => {
    console.log("🤖 Connecté à OpenAI Realtime");
  });

  // ---- Twilio → OpenAI (audio entrant) ----
  twilioWs.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.event === "media") {
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload, // base64 PCM μ-law 8khz
        })
      );
    }

    if (data.event === "start") {
      ai.send(JSON.stringify({ type: "input_audio_buffer.start" }));
    }

    if (data.event === "stop") {
      ai.send(JSON.stringify({ type: "input_audio_buffer.stop" }));
    }
  });

  // ---- OpenAI → Twilio (envoi audio généré) ----
  ai.on("message", (msg) => {
    const packet = JSON.parse(msg.toString());

    if (packet.type === "response.audio.delta") {
      // on renvoie le morceau audio à Twilio
      twilioWs.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: packet.delta, // base64
          },
        })
      );
    }
  });

  ai.on("close", () => {
    console.log("🤖 OpenAI fermé");
    twilioWs.close();
  });

  twilioWs.on("close", () => {
    console.log("❌ Twilio WebSocket fermé");
    ai.close();
  });
});
