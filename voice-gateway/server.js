// voice-gateway/server.js

const WebSocket = require("ws");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("🔧 OPENAI_API_KEY chargée ?", OPENAI_API_KEY ? "OUI" : "NON");

// ---- Serveur WebSocket Railway ----
const wss = new WebSocket.Server({ port: PORT });
console.log("🚀 Voice Gateway WebSocket démarré sur ws://localhost:" + PORT);

// ---- Connexion OpenAI Realtime ----
function createOpenAIConnection() {
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

wss.on("connection", (twilio) => {
  console.log("🔔 Connexion WebSocket Twilio");

  const ai = createOpenAIConnection();
  let aiReady = false;
  let hasAudio = false;
  let streamSid = null;         // important pour renvoyer l’audio à Twilio
  const pendingEvents = [];

  // -----------------------------
  //   TRAITEMENT EVENTS TWILIO
  // -----------------------------
  function handleTwilioEvent(data) {
    const ev = data.event;

    if (ev === "start") {
      console.log("▶️ START Twilio");

      hasAudio = false;

      // on récupère le streamSid fourni par Twilio
      if (data.start && data.start.streamSid) {
        streamSid = data.start.streamSid;
        console.log("💡 streamSid =", streamSid);
      }

      // on nettoie le buffer côté OpenAI
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.clear",
        })
      );

      return;
    }

    if (ev === "media") {
      hasAudio = true;

      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload, // μ-law 8kHz base64
        })
      );

      return;
    }

    if (ev === "stop") {
      console.log("⏹ STOP Twilio");

      if (!hasAudio) {
        console.log("⏹ STOP ignoré : aucun audio reçu");
        return;
      }

      // On demande une réponse vocale courte
      ai.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions:
              "Réponds en français, brièvement, avec la voix Alloy. " +
              "Tu es l'assistant du food truck Call2Food.",
            modalities: ["audio", "text"],
          },
        })
      );

      return;
    }
  }

  // -----------------------------
  //   OPENAI CONNECTÉ
  // -----------------------------
  ai.on("open", () => {
    console.log("🤖 OpenAI Realtime connecté");
    aiReady = true;

    // Config session (audio bidirectionnel)
    ai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions:
            "Tu es Call2Food. Tu prends les commandes de pizzas et sushis en français, de façon concise et polie.",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: "alloy",
        },
      })
    );

    // Rejouer les events Twilio en attente
    if (pendingEvents.length > 0) {
      console.log("📥 Relecture des events :", pendingEvents.length);
      for (const ev of pendingEvents) handleTwilioEvent(ev);
      pendingEvents.length = 0;
    }

    // Message de bienvenue vocal (après avoir eu START → streamSid)
    ai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Bonjour, ici Call2Food. Que désirez-vous commander aujourd’hui ?",
          modalities: ["audio", "text"],
        },
      })
    );
  });

  ai.on("error", (err) => {
    console.error("⚠️ Erreur OpenAI :", err);
  });

  // -----------------------------
  //    TWILIO → OPENAI
  // -----------------------------
  twilio.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      console.log("⚠️ JSON Twilio invalide");
      return;
    }

    if (!aiReady) {
      console.log("⏳ Mis en attente:", data.event);
      pendingEvents.push(data);
      return;
    }

    handleTwilioEvent(data);
  });

  // -----------------------------
  //    OPENAI → TWILIO
  // -----------------------------
  ai.on("message", (raw) => {
    let packet;

    try {
      packet = JSON.parse(raw.toString());
    } catch {
      console.log("⚠️ JSON OpenAI invalide");
      return;
    }

    // audio génération en cours
    if (packet.type === "response.audio.delta" && packet.delta) {
      if (twilio.readyState === WebSocket.OPEN && streamSid) {
        twilio.send(
          JSON.stringify({
            event: "media",
            streamSid,               // <<< OBLIGATOIRE pour Twilio
            media: { payload: packet.delta },
          })
        );
      }
    }

    if (packet.type === "response.completed") {
      console.log("✅ Réponse OpenAI terminée");
    }

    if (packet.type === "error") {
      console.log("⚠️ OpenAI ERROR:", packet);
    }
  });

  // Fermeture propre
  twilio.on("close", () => {
    console.log("❌ WS Twilio fermé");
    try {
      ai.close();
    } catch {}
  });

  ai.on("close", () => {
    console.log("🤖 WS OpenAI fermé");
    try {
      twilio.close();
    } catch {}
  });

  twilio.on("error", (err) => {
    console.error("❌ Erreur WS Twilio :", err);
  });
});
