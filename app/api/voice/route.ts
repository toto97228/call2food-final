// app/api/voice/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { parseVoiceOrder } from '@/lib/aiOrderParser';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const fromNumber = body.from_number as string | undefined;
    const speechResult = body.speech_result as string | undefined;

    if (!fromNumber || !speechResult) {
      return NextResponse.json(
        {
          error: 'invalid_body',
          details: 'from_number and speech_result are required',
        },
        { status: 400 },
      );
    }

    // 1) Parsing avec DeepSeek / OpenAI / Mock
    const parsed = await parseVoiceOrder({
      phoneNumber: fromNumber,
      transcript: speechResult,
    });

    // 2) Création de la commande via /api/orders
    const origin = req.nextUrl.origin; // ex: http://localhost:3000
    const ordersUrl = `${origin}/api/orders`;

    const orderRes = await fetch(ordersUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: parsed.phone_number,
        client_name: parsed.client_name,
        items: parsed.items,
        notes: parsed.notes ?? null,
        source: 'twilio',
        raw_transcript: parsed.raw_transcript,
        needs_human: parsed.needs_human,
        engine: parsed.engine,
      }),
    });

    const orderJson = await orderRes.json();

    if (!orderRes.ok) {
      console.error('/api/orders error from /api/voice:', orderJson);
      return NextResponse.json(
        { error: 'order_create_failed', details: orderJson },
        { status: 500 },
      );
    }

    // 3) Réponse finale avec engine pour debug
    return NextResponse.json(
      {
        engine: parsed.engine,
        needs_human: parsed.needs_human,
        parsed_order: {
          phone_number: parsed.phone_number,
          client_name: parsed.client_name,
          items: parsed.items,
          notes: parsed.notes ?? null,
        },
        order: orderJson.order ?? null,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('POST /api/voice exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
