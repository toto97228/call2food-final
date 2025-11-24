// app/api/voice/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="fr-FR">
    Bienvenue chez Call to Eat. Votre commande va être prise en charge par notre assistant.
  </Say>
  <Connect>
    <Stream url="wss://call2food-final-production.up.railway.app" />
  </Connect>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
