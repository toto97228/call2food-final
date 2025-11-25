import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
dotenv.config();

console.log("🔧 OPENAI_API_KEY ?",
  process.env.OPENAI_API_KEY ? "OK" : "ABSENTE"
);

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const wss = new WebSocketServer({ port: PORT });
console.log("🚀 Gateway WebSocket démarré sur port", PORT);

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

wss.on("connection", (twilio) => {
  console.log("🔔 Connexion Twilio");
  const ai = connectOpenAI();

  ai.on("open", () => console.log("🤖 OpenAI connecté"));
  ai.on("error", (err) => console.error("Erreur OpenAI :", err));

  twilio.on("message", (raw) => {
    const data = JSON.parse(raw.toString());

    if (data.event === "start")
      ai.send(JSON.stringify({ type: "input_audio_buffer.start" }));

    if (data.event === "media")
      ai.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: data.media.payload,
      }));

    if (data.event === "stop")
      ai.send(JSON.stringify({ type: "input_audio_buffer.stop" }));
  });

  ai.on("message", (raw) => {
    const res = JSON.parse(raw.toString());
    if (res.type === "response.audio.delta") {
      twilio.send(JSON.stringify({
        event: "media",
        media: { payload: res.delta },
      }));
    }
  });
});
