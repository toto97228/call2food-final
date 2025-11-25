// voice-gateway/server.js

import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
dotenv.config();

// --- DEBUG clé ---
console.log(
  "🔧 OPENAI_API_KEY ?",
  process.env.OPENAI_API_KEY ? "OK" : "ABSENTE"
);

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// --- Serveur WebSocket pour Twilio ---
const wss = new WebSocketServer({ port: PORT });
console.log("🚀 Gateway WebSocket démarré sur port", PORT);

// --- Connexion au WebSocket Realtime OpenAI ---
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

wss.on("connection", (twilioWs) => {
  console.log("🔔 Connexion Twilio");

  const ai = connectOpenAI();

  ai.on("open", () => {
    console.log("🤖 OpenAI connecté");

    // Configurer la session : modèle, voix, instructions
    ai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          model: "gpt-4o-realtime-preview",
          voice: "alloy",
          // Petit prompt pour le bot
          instructions:
            "Tu es l'assistant vocal Call2Food. " +
            "Parle en français, pose des questions pour prendre une commande " +
            "de pizza ou sushi et confirme toujours la commande.",
          modalities: ["audio"],
        },
      })
    );
  });

  ai.on("error", (err) => {
    console.error("❌ Erreur OpenAI :", err);
  });

  // --- Twilio -> OpenAI ---
  twilioWs.on("message", (raw) => {
    const data = JSON.parse(raw.toString());

    if (data.event === "start") {
      console.log("📞 Twilio event: start");
      // On commence à remplir le buffer audio
      ai.send(JSON.stringify({ type: "input_audio_buffer.start" }));
    }

    if (data.event === "media") {
      // Audio µ-law base64 Twilio -> buffer OpenAI
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        })
      );
    }

    if (data.event === "stop") {
      console.log("📞 Twilio event: stop (fin de phrase)");

      // On dit à OpenAI que le buffer est complet
      ai.send(JSON.stringify({ type: "input_audio_buffer.commit" }));

      // On demande explicitement une réponse vocale
      ai.send(
        JSON.stringify({
          type: "response.create",
          response: {
            // On garde la même session / instructions, donc pas besoin de répéter
            modalities: ["audio"],
          },
        })
      );
    }
  });

  // --- OpenAI -> Twilio ---
  ai.on("message", (raw) => {
    const packet = JSON.parse(raw.toString());

    // OpenAI renvoie l'audio par petits morceaux
    if (packet.type === "response.audio.delta") {
      // On renvoie ce chunk à Twilio
      twilioWs.send(
        JSON.stringify({
          event: "media",
          media: { payload: packet.delta },
        })
      );
    }

    // Optionnel : log quand la réponse est terminée
    if (packet.type === "response.completed") {
      console.log("✅ Réponse OpenAI terminée pour cet échange");
    }
  });

  // Fermeture côté Twilio
  twilioWs.on("close", () => {
    console.log("❌ WebSocket Twilio fermé");
    try {
      ai.close();
    } catch {}
  });

  // Fermeture côté OpenAI
  ai.on("close", () => {
    console.log("❌ WebSocket OpenAI fermé");
    try {
      twilioWs.close();
    } catch {}
  });
});
