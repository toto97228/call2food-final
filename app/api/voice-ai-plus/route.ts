/// app/api/voice-ai-plus/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractFromSpeech } from "@/lib/extractFromSpeech";

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
/* (fallback si on ne comprend pas les produits) */
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
/* Helper: récupérer les produits disponibles    */
/* --------------------------------------------- */
async function getAvailableProducts() {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, name, available, is_out_of_stock");

  if (error) {
    console.error("[PRODUCTS SELECT ERROR]", error);
    return [];
  }

  return (
    data?.filter(
      (p) => p.available === true && p.is_out_of_stock === false
    ) ?? []
  );
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
      input: ["speech"], // tableau, requis par les types Twilio
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

    // 2.a) Client (on le crée dès maintenant, même si on ne comprend pas tout)
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

    // 2.c) Essayer d'extraire une vraie commande à partir de la phrase
    const products = await getAvailableProducts();

    const parsed = extractFromSpeech(effectiveTranscript, products);

    if (DEBUG) {
      console.log("🧩 [VOICE-AI-PLUS TWILIO] Parsed items:", parsed.items);
    }

    let orderCreated = false;
    let summarySpoken = "";

    // 2.d) Si on a reconnu au moins un produit, on passe par /api/orders
    if (parsed.items.length > 0) {
      const baseUrl = new URL(req.url);
      baseUrl.pathname = "/api/orders";
      baseUrl.search = "";

      const orderBody = {
        phone_number: from,
        client_name: clientName,
        items: parsed.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
        })),
        notes: effectiveTranscript,
        source: "twilio" as const,
      };

      if (DEBUG) {
        console.log("📨 [VOICE-AI-PLUS TWILIO] Sending to /api/orders:", {
          url: baseUrl.toString(),
          body: orderBody,
        });
      }

      const resp = await fetch(baseUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderBody),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(
          "[VOICE-AI-PLUS TWILIO] /api/orders error:",
          resp.status,
          text
        );
      } else {
        orderCreated = true;

        const json = await resp.json().catch(() => null as any);

        const itemsText = parsed.items
          .map((i) => `${i.quantity} ${i.name}`)
          .join(" et ");

        const totalPrice =
          json?.order?.total_price ??
          json?.order?.total ??
          null;

        if (typeof totalPrice === "number" && totalPrice > 0) {
          summarySpoken = `Merci. Votre commande a bien été enregistrée : ${itemsText}, pour un total d'environ ${totalPrice} euros.`;
        } else {
          summarySpoken = `Merci. Votre commande a bien été enregistrée : ${itemsText}.`;
        }
      }
    }

    // 2.e) Si on n'a pas réussi à créer une commande structurée,
    // on garde le fallback "commande minimale" comme avant
    if (!orderCreated) {
      const noteForOrder =
        transcriptStatusNote && transcriptStatusNote.length > 0
          ? `${effectiveTranscript} (${callTag}, ${transcriptStatusNote})`
          : `${effectiveTranscript} (${callTag})`;

      const { order, error: orderError } = await createOrderFromTranscript({
        clientId,
        note: noteForOrder,
      });

      if (DEBUG) {
        console.log("📦 [VOICE-AI-PLUS TWILIO] Fallback order insert", {
          ok: !orderError,
          orderId: order?.id,
        });
      }

      if (!summarySpoken) {
        if (
          effectiveTranscript &&
          effectiveTranscript !== "[EMPTY_SPEECH_RESULT]"
        ) {
          summarySpoken = `Merci. J'ai bien noté votre commande : ${effectiveTranscript}. Nous allons la préparer dans les meilleurs délais.`;
        } else {
          summarySpoken =
            "Merci. J'ai bien reçu votre appel, mais je n'ai pas réussi à comprendre clairement votre commande. Merci de rappeler ou de passer directement au food truck pour confirmer.";
        }
      }
    }

    // 2.f) Réponse vocale
    const twiml = new VoiceResponse();
    twiml.say({ voice: "alice", language: "fr-FR" }, summarySpoken);
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
