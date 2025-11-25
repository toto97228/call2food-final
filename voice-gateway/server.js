// voice-gateway/server.js

const WebSocket = require("ws");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

console.log("🔧 OPENAI_API_KEY chargée ?", OPENAI_API_KEY ? "OUI" : "NON");

// --- WebSocket serveur (Railway) ---
const wss = new WebSocket.Server({ port: PORT });
console.log("🚀 Voice Gateway WebSocket démarré sur ws://localhost:" + PORT);

// --- Connexion OpenAI Realtime ---
function createOpenAIConnection() {
  const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

  return new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });
}

// --- Connexions Twilio ---
wss.on("connection", (twilioWs) => {
  console.log("🔔 Connexion WebSocket Twilio");

  const ai = createOpenAIConnection();
  let aiReady = false;

  // Quand OpenAI est connecté
  ai.on("open", () => {
    console.log("🤖 OpenAI Realtime connecté");
    aiReady = true;

    // Config de la session (voix, format audio, rôle…)
    ai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions:
            "Tu es Call2Food, un assistant qui prend les commandes de pizzas et de sushis au téléphone en français. " +
            "Sois clair, poli, et pose des questions pour construire la commande.",
          input_audio_format: "g711_ulaw",  // format Twilio
          output_audio_format: "g711_ulaw", // pour renvoyer vers Twilio
          voice: "alloy",
        },
      })
    );

    // Premier message de bienvenue
    ai.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Commence par dire : 'Bonjour, ici Call2Food. Que puis-je préparer pour vous aujourd’hui ?'",
        },
      })
    );
  });

  ai.on("error", (err) => {
    console.error("❌ Erreur OpenAI :", err);
  });

  // --- Twilio → OpenAI (audio entrant) ---
  twilioWs.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      console.error("JSON Twilio invalide :", e);
      return;
    }

    if (!aiReady) {
      console.log("⏳ OpenAI pas encore prêt, on ignore event:", data.event);
      return;
    }

    if (data.event === "start") {
      console.log("▶️ Stream Twilio START");
      ai.send(JSON.stringify({ type: "input_audio_buffer.start" }));
    } else if (data.event === "media") {
      // audio μ-law base64 -> on push dans le buffer OpenAI
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload,
        })
      );
    } else if (data.event === "stop") {
      console.log("⏹ Stream Twilio STOP");
      ai.send(JSON.stringify({ type: "input_audio_buffer.stop" }));
      // on peut demander une dernière réponse si besoin :
      ai.send(JSON.stringify({ type: "response.create" }));
    }
  });

  // --- OpenAI → Twilio (audio de la voix) ---
  ai.on("message", (raw) => {
    let packet;
    try {
      packet = JSON.parse(raw.toString());
    } catch (e) {
      console.error("JSON OpenAI invalide :", e);
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
    }
  });

  // Fermetures propres
  twilioWs.on("close", () => {
    console.log("❌ WebSocket Twilio fermé");
    if (
      ai.readyState === WebSocket.OPEN ||
      ai.readyState === WebSocket.CONNECTING
    ) {
      ai.close();
    }
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Erreur Twilio WebSocket :", err);
  });

  ai.on("close", () => {
    console.log("🤖 Connexion OpenAI fermée");
    if (
      twilioWs.readyState === WebSocket.OPEN ||
      twilioWs.readyState === WebSocket.CONNECTING
    ) {
      twilioWs.close();
    }
  });
});
