// app/api/voice/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { parseVoiceOrder } from '@/lib/aiOrderParser';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: 'invalid_json_body' },
        { status: 400 },
      );
    }

    // Adapte ici aux champs que Twilio t’envoie réellement
    const phoneNumber: string =
      body.from_number || body.phone_number || body.From || '';
    const transcript: string =
      body.speech_result || body.transcript || body.SpeechResult || '';

    if (!phoneNumber || !transcript) {
      return NextResponse.json(
        {
          error: 'missing_phone_or_transcript',
          details:
            'Champs attendus: from_number / phone_number / From et speech_result / transcript / SpeechResult',
        },
        { status: 400 },
      );
    }

    // 1) Utiliser l’IA pour parser la commande
    const parsed = await parseVoiceOrder({ phoneNumber, transcript });

    // 2) Envoyer vers /api/orders (la route qu’on a déjà testée)
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    const orderPayload = {
      phone_number: parsed.phone_number,
      client_name: parsed.client_name,
      items: parsed.items,
      notes: parsed.notes,
      source: parsed.source,
      raw_transcript: parsed.raw_transcript,
      needs_human: parsed.needs_human ?? false,
    };

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Erreur /api/orders :', text);
      return NextResponse.json(
        { error: 'orders_api_failed', details: text },
        { status: 500 },
      );
    }

    const createdOrder = await res.json();

    return NextResponse.json(
      {
        status: 'ok',
        order: createdOrder,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('POST /api/voice exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error', details: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}

// Optionnel : tu peux garder un GET de test si tu veux
export async function GET() {
  return NextResponse.json({ status: 'voice_api_ok' });
}
