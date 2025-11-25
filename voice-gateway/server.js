// voice-gateway/server.js (CommonJS + garde readyState)

const WebSocket = require("ws");
const dotenv = require("dotenv");

dotenv.config();

const { WebSocketServer } = WebSocket;

console.log(
  "🔧 OPENAI_API_KEY chargée ?",
  process.env.OPENAI_API_KEY ? "OUI" : "NON"
);

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante, arrêt du serveur");
  process.exit(1);
}

// ---- Serveur WebSocket pour Twilio ----
const wss = new WebSocketServer({ port: PORT });
console.log("🚀 Voice Gateway WebSocket démarré sur ws://localhost:" + PORT);

// ---- Connexion OpenAI Realtime ----
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
  console.log("🔔 Connexion WebSocket Twilio");

  const ai = connectOpenAI();

  ai.on("open", () => {
    console.log("🤖 OpenAI Realtime connecté");
  });

  ai.on("error", (err) => {
    console.error("❌ Erreur OpenAI :", err);
  });

  // Twilio -> OpenAI
  twilioWs.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // 🛡️ Si OpenAI n'est pas encore prêt, on ignore pour éviter le crash
    if (ai.readyState !== WebSocket.OPEN) {
      console.log("⏳ OpenAI pas encore prêt, on ignore event:", data.event);
      return;
    }

    if (data.event === "start") {
      ai.send(JSON.stringify({ type: "input_audio_buffer.start" }));
    }

    if (data.event === "media" && data.media && data.media.payload) {
      ai.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.media.payload, // base64 µ-law 8kHz
        })
      );
    }

    if (data.event === "stop") {
      ai.send(JSON.stringify({ type: "input_audio_buffer.stop" }));
    }
  });

  // OpenAI -> Twilio
  ai.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "response.audio.delta" && msg.delta) {
      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.send(
          JSON.stringify({
            event: "media",
            media: { payload: msg.delta }, // audio base64 vers Twilio
          })
        );
      }
    }
  });

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
});
