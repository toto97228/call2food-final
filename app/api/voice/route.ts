import twilio from "twilio";
import { NextResponse } from "next/server";

export async function POST() {
  const twiml = new twilio.twiml.VoiceResponse();

  // 1) Message de bienvenue
  twiml.say(
    {
      voice: "alice",
      language: "fr-FR",
    },
    "Bienvenue chez Call to Eat. Votre commande va être prise en charge par notre assistant."
  );

  // 2) Connexion au stream temps réel
  const connect = twiml.connect();
  connect.stream({
    url: "wss://call2food-final-production.up.railway.app",
  });

  return new NextResponse(twiml.toString(), {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
