// voice-gateway/server.js
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY manquante dans les variables d'environnement");
  process.exit(1);
}

// --- Serveur WebSocket Railway (reçoit Twilio) ---
const wss = new WebSocketServer({ port: PORT });

console.log("🎧 Voice Gateway WebSocket READY on port", PORT);

wss.on("connection", (twilioWs) => {
  console.log("🔔 Nouvelle connexion WebSocket Twilio");

  let currentStreamSid = null;

  // --- Connexion au Realtime WebSocket OpenAI ---
  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  openaiWs.on("open", () => {
    console.log("✅ Connecté au Realtime OpenAI");

    // Configuration de la session : voix alloy + audio G711 μ-law
    const sessionUpdate = {
      type: "session.update",
      session: {
        voice: "alloy",
        modalities: ["audio", "text"],
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        turn_detection: { type: "server_vad" },
        instructions:
          "Tu es l'assistant vocal du food truck Call2Food. " +
          "Tu parles français, tu es rapide et poli. " +
          "Tu prends des commandes de pizzas et de sushis. " +
          "Pose des questions courtes et efficaces jusqu'à ce que la commande soit complète.",
      },
    };

    openaiWs.send(JSON.stringify(sessionUpdate));

    // Premier message automatique (message de bienvenue)
    openaiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Salue le client et demande-lui ce qu'il souhaite commander aujourd'hui.",
        },
      })
    );
  });

  // --- Messages reçus d'OpenAI (audio de réponse) ---
  openaiWs.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.error("⚠️ Message OpenAI non JSON :", e);
      return;
    }

    // L'audio sortant arrive sous forme de chunks base64
    if (msg.type === "response.audio.delta" && msg.delta && currentStreamSid) {
      const audioBase64 = msg.delta;

      const mediaMsg = {
        event: "media",
        streamSid: currentStreamSid,
        media: {
          // OpenAI renvoie déjà du g711_ulaw en base64, compatible Twilio
          payload: audioBase64,
        },
      };

      try {
        twilioWs.send(JSON.stringify(mediaMsg));
      } catch (e) {
        console.error("⚠️ Erreur en renvoyant l'audio vers Twilio :", e);
      }
    }
  });

  openaiWs.on("close", () => {
    console.log("🔌 Connexion OpenAI fermée");
  });

  openaiWs.on("error", (err) => {
    console.error("❌ Erreur WebSocket OpenAI :", err);
  });

  // --- Messages reçus de Twilio (start / media / stop) ---
  twilioWs.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.error("⚠️ Message Twilio non JSON :", e);
      return;
    }

    switch (msg.event) {
      case "start":
        currentStreamSid = msg.start?.streamSid;
        console.log("▶️ Stream Twilio démarré :", currentStreamSid);
        break;

      case "media":
        // Chunks audio g711_ulaw venant de Twilio
        if (
          openaiWs.readyState === WebSocket.OPEN &&
          msg.media &&
          msg.media.payload
        ) {
          const audioBase64 = msg.media.payload;

          const appendEvent = {
            type: "input_audio_buffer.append",
            audio: audioBase64, // g711_ulaw base64
          };

          try {
            openaiWs.send(JSON.stringify(appendEvent));
          } catch (e) {
            console.error("⚠️ Erreur en envoyant l'audio vers OpenAI :", e);
          }
        }
        break;

      case "stop":
        console.log("⏹️ Stream Twilio arrêté :", currentStreamSid);
        currentStreamSid = null;
        break;

      default:
        // Autres events Twilio (mark, dtmf, etc.)
        // console.log("Autre event Twilio :", msg.event);
        break;
    }
  });

  twilioWs.on("close", () => {
    console.log("❌ Connexion WebSocket Twilio fermée");
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Erreur WebSocket Twilio :", err);
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });
});

