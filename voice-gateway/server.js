// voice-gateway/server.js

const WebSocket = require("ws");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("🔧 OPENAI_API_KEY chargée ?", OPENAI_API_KEY ? "OUI" : "NON");

// --- Serveur WebSocket (Railway) ---
const wss = new WebSocket.Server({ port: PORT });
console.log("🚀 Voice Gateway WebSocket démarré sur ws://localhost:" + PORT);

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

wss.on("connection", (twilioWs) => {
  console.log("🔔 Connexion WebSocket Twilio");

  const ai = createOpenAIConnection();
  let aiReady = false;
  let hasAudio = false;          // est-ce qu'on a reçu au moins un chunk ?
  const pendingEvents = [];      // events Twilio reçus avant que OpenAI soit prêt

  // --- TRAITEMENT DES EVENTS TWILIO ---
  function handleTwilioEvent(data) {
    const ev = data.event;

    if (ev === "start") {
      console.log("▶️ Stream Twilio START");

      hasAudio = false;
      // on vide le buffer côté OpenAI
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
      console.log("⏹ Stream Twilio STOP");

      // si aucun audio, on ne commit pas (sinon erreur input_audio_buffer_commit_empty)
      if (!hasAudio) {
        console.log("⏹ STOP sans audio, on ignore commit/response");
        return;
      }

      // on clôture le buffer audio
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.commit",
        })
      );

      // on demande une réponse vocale (Audio via la config de session : voice=alloy)
      ai.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions:
              "Réponds en français, très court. Confirme ou clarifie la commande pour Call2Food.",
            modalities: ["audio"],
          },
        })
      );

      return;
    }
  }

  // --- Quand OpenAI est connecté ---
  ai.on("open", () => {
    console.log("🤖 OpenAI Realtime connecté");
    aiReady = true;

    // configuration de la session (c'est ici qu'on met la voix alloy)
    ai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions:
            "Tu es Call2Food. Tu prends des commandes de pizzas et de sushis en français, simplement et rapidement.",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          voice: "alloy",
        },
      })
    );

    // message de bienvenue audio
    ai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Dis en français, avec la voix alloy : 'Bonjour, ici Call2Food. Que désirez-vous commander aujourd’hui ?'",
          modalities: ["audio"],
        },
      })
    );

    // rejouer les events mis en attente
    if (pendingEvents.length > 0) {
      console.log("📥 Relecture des events en attente :", pendingEvents.length);
      for (const ev of pendingEvents) {
        handleTwilioEvent(ev);
      }
      pendingEvents.length = 0;
    }
  });

  ai.on("error", (err) => {
    console.error("⚠️ Erreur OpenAI :", err);
  });

  // --- Twilio → OpenAI ---
  twilioWs.on("message", (raw) => {
    let data = null;
    try {
      data = JSON.parse(raw.toString());
    } catch (err) {
      console.error("JSON Twilio invalide :", err);
      return;
    }

    if (!aiReady) {
      console.log("⏳ OpenAI pas prêt → on met en attente:", data.event);
      pendingEvents.push(data);
      return;
    }

    handleTwilioEvent(data);
  });

  // --- OpenAI → Twilio (audio retour) ---
  ai.on("message", (raw) => {
    let packet;
    try {
      packet = JSON.parse(raw.toString());
    } catch (err) {
      console.error("JSON OpenAI invalide :", err);
      return;
    }

    if (packet.type === "response.audio.delta" && packet.delta) {
      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.send(
          JSON.stringify({
            event: "media",
            media: { payload: packet.delta },
          })
        );
      }
    } else if (packet.type === "response.completed") {
      console.log("✅ Réponse OpenAI terminée");
    } else if (packet.type === "error") {
      console.error("⚠️ OpenAI ERROR:", packet);
    }
  });

  // --- Fermetures ---
  twilioWs.on("close", () => {
    console.log("❌ WebSocket Twilio fermé");
    try {
      ai.close();
    } catch {}
  });

  ai.on("close", () => {
    console.log("🤖 Connexion OpenAI fermée");
    try {
      twilioWs.close();
    } catch {}
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Erreur Twilio WebSocket :", err);
  });
});
