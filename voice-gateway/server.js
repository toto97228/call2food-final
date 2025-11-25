// voice-gateway/server.js

import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
dotenv.config();

// --- DEBUG : vérifie que Railway charge bien la clé ---
console.log("🔧 OPENAI_API_KEY chargée ?",
  process.env.OPENAI_API_KEY ? "OUI" : "NON",
  "| longueur =", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
);

// --- Ports & clés ---
const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("🚀 Voice Gateway WebSocket démarré sur port", PORT);

// --- Serveur WebSocket Railway (réception Twilio) ---
const wss = new WebSocketServer({ port: PORT });

// --- Fonction pour se connecter à OpenAI Realtime ---
function connectOpenAI() {
  console.log("🔌 Connexion à OpenAI…");

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

// --- Gestion des connexions Twilio ---
wss.on("connection", (twilioWs) => {
  console.log("🔔 Nouvelle connexion WebSocket Twilio");

  // Connexion OpenAI
  const ai = connectOpenAI();

  ai.on("open", () => {
    console.log("🤖 Connecté à OpenAI Realtime");
  });

  ai.on("error", (err) => {
    console.error("❌ Erreur OpenAI :", err);
  });

  // --- Twilio -> OpenAI ---
  twilioWs.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      switch (data.event) {
        case "start":
          console.log("▶️ Début du flux audio");
          ai.send(JSON.stringify({ type: "input_audio_buffer.start" }));
          break;

        case "media":
          ai.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: data.media.payload, // base64 audio μ-law
            })
          );
          break;

        case "stop":
          console.log("⏹ Fin du flux audio");
          ai.send(JSON.stringify({ type: "input_audio_buffer.stop" }));
          break;
      }
    } catch (err) {
      console.error("Erreur parsing Twilio message:", err);
    }
  });

  // --- OpenAI -> Twilio ---
  ai.on("message", (msg) => {
    const packet = JSON.parse(msg.toString());

    // Réponse vocale envoyée à Twilio
    if (packet.type === "response.audio.delta") {
      twilioWs.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: packet.delta, // base64 audio généré par OpenAI
          },
        })
      );
    }
  });

  // --- Fermeture ---
  ai.on("close", () => {
    console.log("❌ Connexion OpenAI fermée");
    try { twilioWs.close(); } catch {}
  });

  twilioWs.on("close", (code, reason) => {
    console.log("❌ Twilio WebSocket fermé", code, reason);
    try { ai.close(); } catch {}
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Erreur Twilio WebSocket :", err);
  });
});
