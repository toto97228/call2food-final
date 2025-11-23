// app/api/voice/route.ts
import twilio from "twilio";
import { NextResponse } from "next/server";

export async function POST() {
  const twiml = new twilio.twiml.VoiceResponse();

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