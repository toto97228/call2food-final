// voice-gateway/server.js

import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

console.log("🔍 OPENAI_API_KEY chargée ?", process.env.OPENAI_API_KEY ? "OUI" : "NON");


const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("🔑 OPENAI_API_KEY:", OPENAI_API_KEY ? "OK" : "MISSING");

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante dans les variables d'environnement");
}

// ---- Serveur WebSocket Railway (Twilio se connecte ici) ----
const wss = new WebSocketServer({ port: PORT });
console.log("🚀 Voice Gateway WebSocket démarré sur ws://localhost:" + PORT);

// ---- Création d'une connexion OpenAI Realtime ----
function createOpenAIWebSocket() {
  const ai = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  ai.on("open", () => {
    console.log("🤖 Connecté à OpenAI Realtime");

    // Configuration de la session pour la voix téléphonique
    ai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          // Twilio envoie du G.711 μ-law 8kHz
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          // Détection de tours de parole côté serveur
          turn_detection: { type: "server_vad" },
          voice: "alloy",
          instructions:
            "Tu es Call2Eat, un assistant qui prend des commandes de pizzas et sushis au téléphone. " +
            "Tu parles en français, tu es poli mais rapide. Pose peu de questions et répète toujours la commande " +
            "avant de conclure.",
        },
      })
    );

    // On demande à l'assistant de dire une première phrase
    ai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Salue le client et demande-lui ce qu'il veut commander, en une phrase courte.",
        },
      })
    );
  });

  ai.on("error", (err) => {
    console.error("❌ Erreur OpenAI Realtime:", err.message || err);
  });

  ai.on("close", (code, reason) => {
    console.log("🔌 OpenAI Realtime fermé:", code, reason.toString());
  });

  return ai;
}

// ---- Connexions Twilio ----
wss.on("connection", (twilioWs) => {
  console.log("🔔 Nouvelle connexion WebSocket Twilio");

  const ai = createOpenAIWebSocket();

  // Messages venant de Twilio
  twilioWs.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      console.error("⚠️ Message Twilio non JSON:", raw.toString());
      return;
    }

    const event = data.event;

    if (event === "start") {
      console.log("📞 Stream démarré pour appel", data.start?.callSid);
      // On vide le buffer audio côté OpenAI
      ai.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
    }

    if (event === "media") {
      const payload = data.media?.payload;
      if (!payload) return;

      // On pousse le chunk audio Twilio → OpenAI
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: payload, // base64 g711_ulaw
        })
      );
    }

    if (event === "stop") {
      console.log("📞 Stream stop pour appel", data.stop?.callSid);

      // On signale à OpenAI que l'utilisateur a fini de parler
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.commit",
        })
      );

      // On crée une réponse pour ce tour de parole
      ai.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions:
              "Réponds au client en une phrase courte en français, en restant dans le contexte de la commande.",
          },
        })
      );
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ Twilio WebSocket fermé");
    ai.close();
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Erreur WebSocket Twilio:", err.message || err);
  });

  // Messages venant d'OpenAI → renvoyés à Twilio
  ai.on("message", (raw) => {
    let packet;
    try {
      packet = JSON.parse(raw.toString());
    } catch (e) {
      console.error("⚠️ Message OpenAI non JSON:", raw.toString());
      return;
    }

    if (packet.type === "response.audio.delta") {
      // Morceau d'audio généré par GPT
      const chunk = packet.delta;
      if (!chunk) return;

      twilioWs.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: chunk, // base64 g711_ulaw
          },
        })
      );
    }

    if (packet.type === "error") {
      console.error("❌ Erreur OpenAI (packet):", packet);
    }
  });
});

console.log("✅ Voice Gateway initialisé.");
