// app/api/voice-ai-plus/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAIResponse, AIMessage } from "@/lib/aiRouter";

const DEBUG = true;

const VoiceResponse = twilio.twiml.VoiceResponse;

/* --------------------------------------------- */
/* Helper TwiML                                   */
/* --------------------------------------------- */
function xmlResponse(twiml: twilio.twiml.VoiceResponse) {
  return new NextResponse(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/* --------------------------------------------- */
/* Téléchargement Twilio Recording (auth requise)*/
/* --------------------------------------------- */
async function downloadRecording(url: string): Promise<ArrayBuffer> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) throw new Error("TWILIO creds manquantes");

  const mp3Url = url.endsWith(".mp3") ? url : `${url}.mp3`;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const resp = await fetch(mp3Url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Twilio DL Error ${resp.status}: ${t}`);
  }

  return await resp.arrayBuffer();
}

/* --------------------------------------------- */
/* OpenAI STT : Whisper / gpt-4o-mini-transcribe */
/* --------------------------------------------- */
async function transcribeAudio(audio: ArrayBuffer): Promise<string> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY manquant");

    const form = new FormData();
    form.append("model", "gpt-4o-mini-transcribe");

    const file = new File([audio], "audio.mp3", {
      type: "audio/mp3",
    });

    form.append("file", file);

    const resp = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      }
    );

    const data = await resp.json();

    if (!resp.ok) throw new Error(JSON.stringify(data));

    return data.text || "";
  } catch (err) {
    console.error("[STT ERROR]", err);
    return "";
  }
}

/* --------------------------------------------- */
/* Client: trouver ou créer par numéro           */
/* --------------------------------------------- */
/**
 * Table clients :
 *  id uuid PRIMARY KEY
 *  name text NOT NULL
 *  phone text NOT NULL UNIQUE
 *  address text NULL
 *  ai_provider text NULL DEFAULT 'openai'
 */
async function ensureClientForPhone(phone: string): Promise<{
  clientId: string;
  clientName: string;
}> {
  if (!phone) {
    throw new Error("From (phone) manquant dans la requête Twilio");
  }

  const { data: existingClient, error: clientSelectError } =
    await supabaseAdmin
      .from("clients")
      .select("id, name, phone, ai_provider")
      .eq("phone", phone)
      .maybeSingle();

  if (clientSelectError) {
    console.error("[CLIENT SELECT ERROR]", clientSelectError);
    throw clientSelectError;
  }

  if (existingClient) {
    return {
      clientId: existingClient.id as string,
      clientName: (existingClient.name as string) ?? `Client ${phone}`,
    };
  }

  const defaultName = `Client ${phone}`;

  const { data: insertedClient, error: clientInsertError } =
    await supabaseAdmin
      .from("clients")
      .insert({
        name: defaultName,
        phone,
      })
      .select("id, name, phone, ai_provider")
      .single();

  if (clientInsertError || !insertedClient) {
    console.error("[CLIENT INSERT ERROR]", clientInsertError);
    throw clientInsertError ?? new Error("client_insert_failed");
  }

  return {
    clientId: insertedClient.id as string,
    clientName:
      (insertedClient.name as string | null | undefined) ?? defaultName,
  };
}

/* --------------------------------------------- */
/* Récupération AI provider du client (Supabase) */
/* --------------------------------------------- */
async function getClientAIProvider(
  phone: string
): Promise<"openai" | "deepseek"> {
  if (!phone) return "openai";

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("ai_provider")
    .eq("phone", phone)
    .maybeSingle();

  if (error || !data || !data.ai_provider) {
    console.warn("[AI PROVIDER] client not found or no provider, fallback openai");
    return "openai";
  }

  const value = String(data.ai_provider).toLowerCase();
  if (value === "deepseek") return "deepseek";
  return "openai";
}

/* --------------------------------------------- */
/* Log dans voice_orders                         */
/* --------------------------------------------- */
/**
 * Table voice_orders :
 *  id uuid DEFAULT gen_random_uuid()
 *  from_number text
 *  speech_result text
 *  created_at timestamptz DEFAULT now()
 *  product_name text
 *  quantity integer
 */
async function createVoiceOrderLog(params: {
  fromNumber: string | null;
  transcript: string;
}) {
  const { fromNumber, transcript } = params;

  const { error } = await supabaseAdmin.from("voice_orders").insert({
    from_number: fromNumber ?? null,
    speech_result: transcript,
    product_name: null,
    quantity: null,
  });

  if (error) {
    console.error("[VOICE_ORDERS INSERT ERROR]", error);
  }
}

/* --------------------------------------------- */
/* Création d'une commande minimale dans orders  */
/* --------------------------------------------- */
/**
 * Table orders :
 *  id uuid PK DEFAULT gen_random_uuid()
 *  client_id uuid NOT NULL REFERENCES clients(id)
 *  status text NOT NULL DEFAULT 'confirmed'
 *  delivery_mode text NULL
 *  delivery_address text NULL
 *  note text NULL
 *  total numeric(10,2) NOT NULL DEFAULT 0
 *  total_price numeric NULL
 *  needs_human boolean NOT NULL DEFAULT false
 */
async function createOrderFromTranscript(params: {
  clientId: string;
  transcript: string;
}) {
  const { clientId, transcript } = params;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .insert({
      client_id: clientId,
      status: "new", // cohérent avec /api/orders
      delivery_mode: null,
      delivery_address: null,
      note: transcript || null,
      total: 0,
      total_price: 0,
    })
    .select(
      "id, client_id, status, delivery_mode, delivery_address, note, total, total_price, created_at"
    )
    .single();

  if (error || !data) {
    console.error("[ORDERS INSERT ERROR]", error);
    return { order: null as any, error };
  }

  return { order: data, error: null };
}

/* --------------------------------------------- */
/* Handler principal TWILIO                      */
/* --------------------------------------------- */
export async function POST(req: NextRequest) {
  const form = await req.formData();

  const recordingUrl = form.get("RecordingUrl")?.toString();
  const from = form.get("From")?.toString() || "";
  const callSid = form.get("CallSid")?.toString() || null;

  /* -------- 1) Premier passage : pas d'enregistrement -------- */
  if (!recordingUrl) {
    const twiml = new VoiceResponse();

    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Bonjour, après le bip, dites votre commande, puis appuyez sur dièse pour terminer."
    );

    twiml.record({
      action: "/api/voice-ai-plus",
      method: "POST",
      playBeep: true,
      maxLength: 60,
      trim: "trim-silence",
    });

    return xmlResponse(twiml);
  }

  /* -------- 2) Deuxième passage : transcription + DB + IA ----- */
  try {
    if (DEBUG) console.log("📥 Recording URL:", recordingUrl);

    const audio = await downloadRecording(recordingUrl);
    const transcript = (await transcribeAudio(audio)).trim();

    if (DEBUG) console.log("📝 Transcript:", transcript);

    if (!transcript) {
      const twiml = new VoiceResponse();
      twiml.say(
        { voice: "alice", language: "fr-FR" },
        "Désolé, je n'ai pas compris votre message."
      );
      twiml.hangup();
      return xmlResponse(twiml);
    }

    // 2.a) client: trouver ou créer
    const { clientId, clientName } = await ensureClientForPhone(from);

    if (DEBUG) console.log("👤 Client:", { clientId, clientName, from });

    // 2.b) log dans voice_orders (debug / historique brut)
    await createVoiceOrderLog({
      fromNumber: from || null,
      transcript,
    });

    // 2.c) créer une commande minimale dans orders
    const { order, error: orderError } = await createOrderFromTranscript({
      clientId,
      transcript,
    });

    if (DEBUG) {
      console.log("📦 Order insert:", {
        ok: !orderError,
        orderId: order?.id,
      });
    }

    // 2.d) provider IA (en fonction de clients.ai_provider si présent)
    const provider = await getClientAIProvider(from);

    if (DEBUG) console.log("🤖 Provider:", provider);

    const baseSystem =
      "Tu es un agent vocal Call2Eat pour un food-truck pizzas et sushis. " +
      "Tu parles en français, de manière courte, claire et professionnelle. ";

    const orderInfo = orderError
      ? "Attention: une erreur technique est survenue lors de l'enregistrement de la commande. " +
        "Informe poliment le client qu'il est possible que la commande ne soit pas correctement sauvegardée, " +
        "et invite-le à rappeler ou à confirmer sur place."
      : order && order.id
      ? `La commande a été enregistrée dans le système interne avec l'identifiant ${order.id}. `
      : "La commande a probablement été enregistrée, mais l'identifiant n'est pas disponible. ";

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          baseSystem +
          orderInfo +
          "Ne fais pas un long discours, reste concis. Résume simplement ce que le client a demandé et " +
          "indique que la commande sera préparée.",
      },
      {
        role: "user",
        content:
          "Le client a dit (transcription brute, non structurée): " + transcript,
      },
    ];

    const aiText = await generateAIResponse({
      provider,
      messages,
    });

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      aiText ||
        "Merci, j'ai enregistré votre commande. Elle sera préparée dans les meilleurs délais."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  } catch (err) {
    console.error("[VOICE IA+ ERROR]", err);

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Une erreur est survenue lors du traitement de votre appel. Merci de rappeler un peu plus tard."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  }
}
