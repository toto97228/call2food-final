// voice-gateway/server.js

import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("🔑 OPENAI_API_KEY présente ?", OPENAI_API_KEY ? "OUI" : "NON");
console.log("🚀 Démarrage Voice Gateway sur le port", PORT);

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante dans les variables d'environnement !");
  process.exit(1);
}

// ---- Serveur WebSocket Railway (reçoit Twilio) ----
const wss = new WebSocketServer({ port: PORT });
console.log("✅ Voice Gateway WebSocket démarré sur ws://localhost:" + PORT);

// Fonction pour ouvrir une connexion Realtime OpenAI
function connectOpenAI() {
  return new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );
}

// ---- Connexions Twilio ----
wss.on("connection", (twilioWs) => {
  console.log("🔔 Nouvelle connexion WebSocket Twilio");

  const ai = connectOpenAI();

  ai.on("open", () => {
    console.log("🤖 Connecté à OpenAI Realtime");

    // On demande à GPT de PARLER tout de suite avec la voix alloy
    ai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Tu es l'assistant vocal de Call2Food. Salue chaleureusement le client en français et demande-lui ce qu'il souhaite commander.",
          modalities: ["audio"],
          voice: "alloy",
        },
      })
    );
  });

  // ---- Messages venant de Twilio (pour debug, on log juste) ----
  twilioWs.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch (err) {
      console.error("❌ Impossible de parser message Twilio:", err);
      return;
    }

    console.log("📩 Event Twilio:", data.event);
    // Pour l’instant on ignore complètement l’audio du client.
  });

  // ---- Messages venant d’OpenAI ----
  ai.on("message", (msg) => {
    let packet;
    try {
      packet = JSON.parse(msg.toString());
    } catch (err) {
      console.error("❌ Impossible de parser message OpenAI:", err);
      return;
    }

    // Debug général
    if (packet.type && packet.type !== "response.audio.delta") {
      console.log("📡 Event OpenAI:", packet.type);
    }

    // Les chunks audio de la voix alloy
    if (packet.type === "response.audio.delta" && packet.delta) {
      twilioWs.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: packet.delta, // audio en base64
          },
        })
      );
    }

    // Erreur renvoyée par OpenAI
    if (packet.type === "error") {
      console.error("⚠️ Erreur OpenAI:", JSON.stringify(packet, null, 2));
    }
  });

  ai.on("close", (code, reason) => {
    console.log("🤖 Socket OpenAI fermé", code, reason.toString());
    try {
      twilioWs.close();
    } catch {}
  });

  ai.on("error", (err) => {
    console.error("❌ Erreur socket OpenAI:", err);
  });

  twilioWs.on("close", (code, reason) => {
    console.log("❌ Twilio WebSocket fermé", code, reason?.toString() ?? "");
    try {
      ai.close();
    } catch {}
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Erreur Twilio WebSocket:", err);
  });
});
