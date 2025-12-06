// app/api/voice/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { parseVoiceOrder } from '@/lib/aiOrderParser';
import twilio from 'twilio';

// ---- Rate limiting simple en mémoire (MVP) ----

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS_PER_IP = 60; // 60 requêtes / minute / IP (à ajuster)

type RateLimitEntry = {
  windowStart: number;
  count: number;
};

const ipRequestCounts = new Map<string, RateLimitEntry>();

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0]!.trim();
  }
  return 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipRequestCounts.get(ip);

  if (!entry) {
    ipRequestCounts.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequestCounts.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count += 1;
  ipRequestCounts.set(ip, entry);

  return entry.count > RATE_LIMIT_MAX_REQUESTS_PER_IP;
}

// ---- Vérification signature Twilio ----

function getTwilioSignature(req: NextRequest): string | null {
  return (
    req.headers.get('x-twilio-signature') ??
    req.headers.get('X-Twilio-Signature')
  );
}

function getTwilioAuthToken(): string | null {
  const token = process.env.TWILIO_AUTH_TOKEN;
  return token && token.length > 0 ? token : null;
}

export async function POST(req: NextRequest) {
  try {
    // 0) Rate limiting simple par IP
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      console.warn('Rate limit exceeded for IP:', ip);
      return NextResponse.json(
        { error: 'rate_limited', details: 'Too many requests' },
        { status: 429 },
      );
    }

    const twilioSignature = getTwilioSignature(req);
    if (!twilioSignature) {
      console.warn('Missing X-Twilio-Signature header on /api/voice');
      return NextResponse.json(
        { error: 'missing_signature' },
        { status: 403 },
      );
    }

    const twilioAuthToken = getTwilioAuthToken();
    if (!twilioAuthToken) {
      console.error(
        'TWILIO_AUTH_TOKEN is not set. Cannot validate Twilio webhook signature.',
      );
      return NextResponse.json(
        {
          error: 'server_misconfigured',
          details: 'TWILIO_AUTH_TOKEN is missing on the server',
        },
        { status: 500 },
      );
    }

    // On récupère le body brut une seule fois
    const rawBody = await req.text();
    const url = req.nextUrl.toString();
    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    let isValid = false;

    if (contentType.includes('application/json')) {
      // Cas JSON (proxy custom éventuel)
      isValid = twilio.validateRequestWithBody(
        twilioAuthToken,
        twilioSignature,
        url,
        rawBody,
      );
    } else {
      // Cas Twilio classique: x-www-form-urlencoded
      const params = Object.fromEntries(new URLSearchParams(rawBody));
      isValid = twilio.validateRequest(
        twilioAuthToken,
        twilioSignature,
        url,
        params,
      );
    }

    if (!isValid) {
      console.warn('Invalid Twilio signature on /api/voice for IP:', ip);
      return NextResponse.json(
        { error: 'invalid_signature' },
        { status: 403 },
      );
    }

    // ----- Parsing du contenu après validation -----

    let fromNumber: string | null = null;
    let speechResult: string | null = null;

    if (contentType.includes('application/json')) {
      // JSON: on parse le body
      let body: any;
      try {
        body = JSON.parse(rawBody);
      } catch (e) {
        console.warn('Invalid JSON body on /api/voice:', e);
        return NextResponse.json(
          {
            error: 'invalid_json',
            details: 'Unable to parse JSON body from Twilio/proxy',
          },
          { status: 400 },
        );
      }
      fromNumber =
        (body.from_number as string | undefined) ??
        (body.From as string | undefined) ??
        null;
      speechResult =
        (body.speech_result as string | undefined) ??
        (body.SpeechResult as string | undefined) ??
        null;
    } else {
      // Form-urlencoded Twilio: From, SpeechResult, ...
      const form = new URLSearchParams(rawBody);
      fromNumber = form.get('From');
      // SpeechResult est envoyé par <Gather input="speech">
      speechResult = form.get('SpeechResult') ?? form.get('speech_result');
    }

    if (!fromNumber || !speechResult) {
      return NextResponse.json(
        {
          error: 'invalid_body',
          details:
            'from_number/From et speech_result/SpeechResult sont requis',
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
    const origin = req.nextUrl.origin;
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
        {
          error: 'order_create_failed',
          details: orderJson,
        },
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
      {
        error: 'unexpected_error',
        details: String(err?.message ?? err),
      },
      { status: 500 },
    );
  }
}
