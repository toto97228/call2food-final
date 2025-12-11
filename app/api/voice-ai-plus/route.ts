// app/api/voice-ai-plus/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; // important pour utiliser le SDK Twilio

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
/* Client: trouver ou créer par numéro           */
/* --------------------------------------------- */
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
/* Log dans voice_orders                         */
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
      status: "new",
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
/* Version: Twilio STT (Gather speech)           */
/* --------------------------------------------- */
export async function POST(req: NextRequest) {
  const form = await req.formData();

  const speechResult = form.get("SpeechResult")?.toString() || "";
  const from = form.get("From")?.toString() || "";
  const callSid = form.get("CallSid")?.toString() || null;

  /* -------- 1) Premier passage : pas encore de SpeechResult --- */
  if (!speechResult) {
    const twiml = new VoiceResponse();

    const gather = twiml.gather({
      input: ["speech"],          // <<<<<< ICI: tableau, plus de string simple
      language: "fr-FR",
      action: "/api/voice-ai-plus",
      method: "POST",
    });

    gather.say(
      { voice: "alice", language: "fr-FR" },
      "Bonjour, dites votre commande pour le food truck après le bip. Quand vous avez terminé, restez silencieux quelques secondes."
    );

    return xmlResponse(twiml);
  }

  /* -------- 2) Deuxième passage : Twilio a renvoyé SpeechResult --- */
  try {
    const callTag = `CALL_${callSid ?? "NO_CALLSID"}`;

    const rawTranscript = speechResult.trim();
    let effectiveTranscript = rawTranscript;
    let transcriptStatusNote = "";

    if (!effectiveTranscript) {
      effectiveTranscript = "[EMPTY_SPEECH_RESULT]";
      transcriptStatusNote = "[TWILIO_STT_EMPTY]";
    }

    if (DEBUG) {
      console.log("📝 [VOICE-AI-PLUS TWILIO] SpeechResult:", {
        effectiveTranscript,
      });
    }

    // 2.a) Client
    const { clientId, clientName } = await ensureClientForPhone(from);

    if (DEBUG) {
      console.log("👤 [VOICE-AI-PLUS TWILIO] Client", { clientId, clientName });
    }

    // 2.b) Log brut dans voice_orders
    const storedTextForVoiceOrders =
      transcriptStatusNote && transcriptStatusNote.length > 0
        ? `${callTag} | ${effectiveTranscript} | ${transcriptStatusNote}`
        : `${callTag} | ${effectiveTranscript}`;

    await createVoiceOrderLog({
      fromNumber: from || null,
      storedText: storedTextForVoiceOrders,
    });

    // 2.c) Création commande minimale dans orders
    const noteForOrder =
      transcriptStatusNote && transcriptStatusNote.length > 0
        ? `${effectiveTranscript} (${callTag}, ${transcriptStatusNote})`
        : `${effectiveTranscript} (${callTag})`;

    const { order, error: orderError } = await createOrderFromTranscript({
      clientId,
      note: noteForOrder,
    });

    if (DEBUG) {
      console.log("📦 [VOICE-AI-PLUS TWILIO] Order insert", {
        ok: !orderError,
        orderId: order?.id,
      });
    }

    // 2.d) Réponse vocale simple (sans LLM)
    const twiml = new VoiceResponse();

    if (effectiveTranscript && effectiveTranscript !== "[EMPTY_SPEECH_RESULT]") {
      twiml.say(
        { voice: "alice", language: "fr-FR" },
        `Merci. J'ai bien noté votre commande : ${effectiveTranscript}. Nous allons la préparer dans les meilleurs délais.`
      );
    } else {
      twiml.say(
        { voice: "alice", language: "fr-FR" },
        "Merci. J'ai bien reçu votre appel, mais je n'ai pas réussi à comprendre clairement votre commande. Merci de rappeler ou de passer directement au food truck pour confirmer."
      );
    }

    twiml.hangup();

    return xmlResponse(twiml);
  } catch (err) {
    console.error("[VOICE-AI-PLUS TWILIO FATAL ERROR]", err);

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Une erreur technique est survenue lors du traitement de votre appel. Merci de rappeler un peu plus tard."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  }
}
