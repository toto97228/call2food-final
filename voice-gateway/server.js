// voice-gateway/server.js
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ Environment variable OPENAI_API_KEY manquante.");
  process.exit(1);
}

// Serveur WebSocket qui reçoit Twilio
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`✅ Voice Gateway WebSocket démarré sur ws://localhost:${PORT}`);
});

wss.on("connection", (twilioWs) => {
  console.log("🔔 Nouvelle connexion WebSocket Twilio");

  let streamSid = null;

  // Connexion WebSocket à l’API Realtime d’OpenAI
  const openaiWs = new WebSocket(
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    }
  );

  // Quand OpenAI est connecté, on configure la session
  openaiWs.on("open", () => {
    console.log("🤖 Connecté à OpenAI Realtime");

    // 1) Configurer la session audio (format g711_ulaw compatible Twilio)
    openaiWs.send(
      JSON.stringify({
        type: "session.update",
        session: {
          // Twilio Media Streams utilise g711 μ-law 8kHz par défaut
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          instructions:
            "Tu es l'assistant vocal du food truck Call2Eat. " +
            "Tu parles français, tu poses des questions courtes " +
            "et tu aides le client à commander pizzas et sushis.",
        },
      })
    );

    // 2) Message d’accueil généré par l’IA
    openaiWs.send(
      JSON.stringify({
        type: "response.create",
        response: {
          instructions:
            "Dis au client : 'Bonjour, bienvenue chez Call2Eat. " +
            "Que souhaitez-vous commander aujourd'hui ?'",
        },
      })
    );
  });

  // Messages reçus d’OpenAI (audio de réponse, etc.)
  openaiWs.on("message", (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch (err) {
      console.error("⚠️ Message OpenAI non valide :", err);
      return;
    }

    // OpenAI envoie des chunks audio sous forme d'événements delta
    if (
      event.type === "response.output_audio.delta" &&
      event.delta?.audio &&
      streamSid
    ) {
      const msgToTwilio = {
        event: "media",
        streamSid,
        media: {
          // audio en base64, déjà au bon format (g711_ulaw)
          payload: event.delta.audio,
        },
      };
      twilioWs.send(JSON.stringify(msgToTwilio));
    }
  });

  openaiWs.on("error", (err) => {
    console.error("❌ Erreur WebSocket OpenAI :", err);
  });

  openaiWs.on("close", () => {
    console.log("🔌 Connexion OpenAI fermée");
  });

  // Messages reçus de Twilio
  twilioWs.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (err) {
      console.error("⚠️ Message Twilio non valide :", err);
      return;
    }

    switch (data.event) {
      case "connected":
        console.log("📞 Twilio event: connected");
        break;

      case "start":
        streamSid = data.start.streamSid;
        console.log("▶️  Stream démarré, streamSid =", streamSid);
        break;

      case "media":
        // audio client → OpenAI
        if (openaiWs.readyState === WebSocket.OPEN && data.media?.payload) {
          openaiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: data.media.payload,
            })
          );
        }
        break;

      case "stop":
        console.log("⏹️  Stream arrêté par Twilio");
        if (openaiWs.readyState === WebSocket.OPEN) {
          // On indique à OpenAI que le buffer est terminé
          openaiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.commit",
            })
          );
        }
        break;

      default:
        console.log("ℹ️  Event Twilio :", data.event);
    }
  });

  twilioWs.on("close", () => {
    console.log("🔌 Connexion Twilio fermée");
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Erreur WebSocket Twilio :", err);
  });
});
