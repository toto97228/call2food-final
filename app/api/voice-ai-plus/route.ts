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
/* (on ne l'utilise pas vraiment en mode debug)  */
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
async function createVoiceOrderLog(params: {
  fromNumber: string | null;
  message: string;
}) {
  const { fromNumber, message } = params;

  const { error } = await supabaseAdmin.from("voice_orders").insert({
    from_number: fromNumber ?? null,
    speech_result: message,
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
async function createOrderDebug(params: {
  clientId: string;
  debugNote: string;
}) {
  const { clientId, debugNote } = params;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .insert({
      client_id: clientId,
      status: "new",
      delivery_mode: null,
      delivery_address: null,
      note: debugNote,
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
/* Handler principal TWILIO (MODE DEBUG)         */
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

  /* -------- 2) Deuxième passage : DEBUG DB ONLY --------------- */
  try {
    const debugTag = `DEBUG_CALL_${callSid ?? "NO_CALLSID"}`;

    if (DEBUG) {
      console.log("✅ [VOICE-AI-PLUS DEBUG] Second POST reçu", {
        from,
        callSid,
        recordingUrl,
      });
    }

    // 2.a) client
    const { clientId, clientName } = await ensureClientForPhone(from);

    if (DEBUG) {
      console.log("👤 [VOICE-AI-PLUS DEBUG] Client", { clientId, clientName });
    }

    // 2.b) log voice_orders
    await createVoiceOrderLog({
      fromNumber: from || null,
      message: debugTag,
    });

    // 2.c) order minimal
    const { order, error: orderError } = await createOrderDebug({
      clientId,
      debugNote: debugTag,
    });

    if (DEBUG) {
      console.log("📦 [VOICE-AI-PLUS DEBUG] Order insert", {
        ok: !orderError,
        orderId: order?.id,
      });
    }

    // 2.d) réponse vocale FIXE (pas d'OpenAI en debug)
    const twiml = new VoiceResponse();

    if (order && order.id) {
      twiml.say(
        { voice: "alice", language: "fr-FR" },
        `Test technique réussi. Votre appel a bien été enregistré dans le système avec un identifiant interne. Merci et à bientôt.`
      );
    } else {
      twiml.say(
        { voice: "alice", language: "fr-FR" },
        `Test technique partiel. J'ai reçu votre appel mais il y a peut être eu un problème lors de l'enregistrement de la commande. Merci de rappeler si nécessaire.`
      );
    }

    twiml.hangup();

    return xmlResponse(twiml);
  } catch (err) {
    console.error("[VOICE IA+ DEBUG ERROR]", err);

    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice", language: "fr-FR" },
      "Une erreur technique est survenue lors du traitement de votre appel. Merci de rappeler un peu plus tard."
    );
    twiml.hangup();

    return xmlResponse(twiml);
  }
}
