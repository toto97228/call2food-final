// app/api/voice/process/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // TwiML qui connecte l'appel au WebSocket hébergé sur Railway
  const twiml = `
    <Response>
      <Connect>
        <Stream url="wss://call2food-final-production.up.railway.app" />
      </Connect>
    </Response>
  `.trim();

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
