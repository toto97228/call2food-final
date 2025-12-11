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
async function transcribeAudio(
  audio: ArrayBuffer
): Promise<{ transcript: string; error?: string }> {
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

    if (!resp.ok) {
      throw new Error(typeof data === "string" ? data : JSON.stringify(data));
    }

    const text = (data as any).text ?? "";
    return { transcript: text };
  } catch (err: any) {
    console.error("[STT ERROR]", err);
    const msg =
      typeof err?.message === "string" ? err.message : String(err ?? "unknown");
    return { transcript: "", error: msg };
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
    console.warn(
      "[AI PROVIDER] client not found or no provider, fallback openai"
    );
    return "openai";
  }

  const value = String(data.ai_provider).toLowerCase();
  if (value === "deepseek") return "deepseek";
  return "openai";
}

/* --------------------------------------------- */
/* Log dans voice_orders                         */
/* voice_orders :
 *  id uuid
 *  from_number text
 *  speech_result text
 *  created_at timestamptz default now()
 *  product_name text
 *  quantity integer
 */
/* --------------------------------------------- */
async function createVoiceOrderLog(params: {
  fromNumber: string | null;
  storedText: string;
}) {
  const { fromNumber, storedText } = params;

  const { error } = await supabaseAdmin.from("voice_orders").insert({
    from_number: fromNumber ?? null,
    speech_result: storedText,
    product_name: null,
    quantity: null,
  });

  if (error) {
    console.error("[VOICE_ORDERS INSERT ERROR]", error);
  }
}

/* --------------------------------------------- */
/* Création d'une commande minimale dans orders  */
/* orders :
 *  id uuid PK
 *  client_id uuid NOT NULL
 *  status text NOT NULL
 *  delivery_mode text
 *  delivery_address text
 *  note text
 *  total numeric(10,2) NOT NULL
 *  total_price numeric
 *  needs_human boolean
 */
/* --------------------------------------------- */
async function createOrderFromTranscript(params: {
  clientId: string;
  note: string;
}) {
  const { clientId, note } = params;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .insert({
      client_id: clientId,
      status: "new", // cohérent avec /api/orders
      delivery_mode: null,
      delivery_address: null,
      note,
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

  /* -------- 2) Deuxième passage : STT + DB + IA courte -------- */
  try {
    const callTag = `CALL_${callSid ?? "NO_CALLSID"}`;

    if (DEBUG) {
      console.log("📥 [VOICE-AI-PLUS] Second POST", {
        from,
        callSid,
        recordingUrl,
      });
    }

    // 2.a) Téléchargement & transcription
    const audio = await downloadRecording(recordingUrl);
    const { transcript, error: sttError } = await transcribeAudio(audio);

    let effectiveTranscript = (transcript || "").trim();
    let transcriptStatusNote = "";

    if (!effectiveTranscript) {
      if (sttError) {
        effectiveTranscript = "[TRANSCRIPTION_ERROR]";
        transcriptStatusNote = `[STT_ERROR] ${sttError}`;
      } else {
        effectiveTranscript = "[EMPTY_TRANSCRIPT]";
        transcriptStatusNote = "[STT_EMPTY_NO_ERROR]";
      }
    }

    if (DEBUG) {
      console.log("📝 [VOICE-AI-PLUS] Transcript:", {
        effectiveTranscript,
        sttError,
      });
    }

    // 2.b) Client (lookup ou création)
    const { clientId, clientName } = await ensureClientForPhone(from);

    if (DEBUG) {
      console.log("👤 [VOICE-AI-PLUS] Client", { clientId, clientName });
    }

    // 2.c) Log brut dans voice_orders
    const storedTextForVoiceOrders =
      transcriptStatusNote && transcriptStatusNote.length > 0
        ? `${callTag} | ${effectiveTranscript} | ${transcriptStatusNote}`
        : `${callTag} | ${effectiveTranscript}`;

    await createVoiceOrderLog({
      fromNumber: from || null,
      storedText: storedTextForVoiceOrders,
    });

    // 2.d) Création commande minimale dans orders
    const noteForOrder =
      transcriptStatusNote && transcriptStatusNote.length > 0
        ? `${effectiveTranscript} (${callTag}, ${transcriptStatusNote})`
        : `${effectiveTranscript} (${callTag})`;

    const { order, error: orderError } = await createOrderFromTranscript({
      clientId,
      note: noteForOrder,
    });

    if (DEBUG) {
      console.log("📦 [VOICE-AI-PLUS] Order insert", {
        ok: !orderError,
        orderId: order?.id,
      });
    }

    // 2.e) Choix provider IA
    const provider = await getClientAIProvider(from);

    if (DEBUG) console.log("🤖 [VOICE-AI-PLUS] Provider:", provider);

    const baseSystem =
      "Tu es un agent vocal Call2Eat pour un food-truck pizzas et sushis. " +
      "Tu dois répondre en français, de manière courte, claire et professionnelle. ";

    const orderInfo = orderError
      ? "Attention: une erreur technique est survenue lors de l'enregistrement de la commande. " +
        "Informe poliment le client qu'il est possible que la commande ne soit pas entièrement sauvegardée, " +
        "et invite-le à confirmer sa commande sur place ou à rappeler."
      : order && order.id
      ? `La commande a été enregistrée avec un identifiant interne ${order.id}. `
      : "La commande a probablement été enregistrée, mais l'identifiant n'est pas disponible. ";

    const sttInfo = sttError
      ? "La transcription automatique a rencontré un problème. Utilise la phrase suivante comme résumé très approximatif de la commande du client."
      : "Utilise la phrase suivante comme transcription de ce que le client a dit pour résumer brièvement sa commande.";

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          baseSystem +
          orderInfo +
          "Ne fais pas un long discours, reste concis. " +
          sttInfo,
      },
      {
        role: "user",
        content:
          "Texte à partir de l'appel téléphonique: " + effectiveTranscript,
      },
    ];

    let aiText: string | null = null;

    try {
      aiText = await generateAIResponse({
        provider,
        messages,
      });
    } catch (aiErr) {
      console.error("[VOICE-AI-PLUS AI ERROR]", aiErr);
      aiText = null;
    }

    const finalSpeech =
      aiText && aiText.trim().length > 0
        ? aiText
        : "Merci, j'ai bien pris en compte votre commande pour le food-truck. Elle sera préparée dans les meilleurs délais.";

    const twiml = new VoiceResponse();
    twiml.say({ voice: "alice", language: "fr-FR" }, finalSpeech);
    twiml.hangup();

    return xmlResponse(twiml);
  } catch (err) {
    console.error("[VOICE-AI-PLUS FATAL ERROR]", err);

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Une erreur technique est survenue lors du traitement de votre appel. Merci de rappeler un peu plus tard."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  }
}
