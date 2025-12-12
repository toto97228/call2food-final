// app/api/voice-ai-plus/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; // important pour utiliser le SDK Twilio

const DEBUG = true;
const VoiceResponse = twilio.twiml.VoiceResponse;

/* --------------------------------------------- */
/* Types internes                                */
/* --------------------------------------------- */

type ParsedItem = {
  productName: string;
  quantity: number;
};

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
/* Normalisation + parsing naïf en français       */
/* --------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  "un.": 1,
  "une.": 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
};

/**
 * IMPORTANT :
 * Les labels doivent correspondre exactement aux colonnes "name" de public.products
 *
 * Table products actuelle (d’après ton screenshot) :
 *  - "Margherita"
 *  - "Supplément jambon"
 *  - "3 Fromages"
 *  - "reine"
 */
const PRODUCT_KEYWORDS: { key: string; label: string }[] = [
  // Margherita
  { key: "margarita", label: "Margherita" },
  { key: "margherita", label: "Margherita" },

  // Reine
  { key: "reine", label: "reine" },

  // 3/4 fromages -> on mappe sur "3 Fromages"
  { key: "4 fromages", label: "3 Fromages" },
  { key: "quatre fromages", label: "3 Fromages" },
  { key: "3 fromages", label: "3 Fromages" },
];

function normalizeForParsing(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlève les accents
    .replace(/[^a-z0-9\s]/g, " ") // garde lettres, chiffres, espaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exemple géré :
 * "je voudrais deux reines et une 4 fromages"
 * => [
 *   { productName: "reine", quantity: 2 },
 *   { productName: "3 Fromages", quantity: 1 }
 * ]
 */
function parseFrenchOrder(text: string): ParsedItem[] {
  const normalized = normalizeForParsing(text);
  if (!normalized) return [];

  const items: ParsedItem[] = [];

  for (const { key, label } of PRODUCT_KEYWORDS) {
    const keyNorm = normalizeForParsing(key);
    const idx = normalized.indexOf(keyNorm);
    if (idx === -1) continue;

    // On regarde 3 mots avant le mot-clé pour trouver la quantité
    const before = normalized.slice(0, idx).trim();
    const beforeTokens = before.split(" ").filter(Boolean);

    let qty = 1; // défaut : 1 pizza
    for (
      let i = beforeTokens.length - 1;
      i >= 0 && i >= beforeTokens.length - 3;
      i--
    ) {
      const tok = beforeTokens[i];

      if (/^\d+$/.test(tok)) {
        qty = parseInt(tok, 10);
        break;
      }

      const numWord = NUMBER_WORDS[tok];
      if (numWord && Number.isFinite(numWord)) {
        qty = numWord;
        break;
      }
    }

    items.push({ productName: label, quantity: qty });
  }

  // Agrégation si le même produit est trouvé plusieurs fois
  const aggregated = new Map<string, number>();
  for (const item of items) {
    const current = aggregated.get(item.productName) ?? 0;
    aggregated.set(item.productName, current + item.quantity);
  }

  return Array.from(aggregated.entries()).map(([productName, quantity]) => ({
    productName,
    quantity,
  }));
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
/* Création des order_items + mise à jour totals */
/* --------------------------------------------- */

async function createOrderItemsFromParsed(params: {
  orderId: string;
  items: ParsedItem[];
}) {
  const { orderId, items } = params;
  if (!items.length) return;

  // Noms de produits distincts
  const productNames = Array.from(
    new Set(items.map((i) => i.productName))
  );

  // On récupère les produits correspondants
  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, name, base_price")
    .in("name", productNames);

  if (productsError) {
    console.error("[PRODUCTS SELECT ERROR]", productsError);
    return;
  }

  if (!products || products.length === 0) {
    console.warn("[PRODUCTS SELECT] Aucun produit trouvé pour", productNames);
    return;
  }

  const productMap = new Map<
    string,
    { id: number; base_price: number }
  >();

  for (const p of products as any[]) {
    const basePriceNumber = Number(p.base_price ?? 0);
    productMap.set(p.name as string, {
      id: p.id as number,
      base_price: basePriceNumber,
    });
  }

  const orderItemsPayload: any[] = [];
  let totalQty = 0;
  let totalPrice = 0;

  for (const item of items) {
    const product = productMap.get(item.productName);
    if (!product) {
      console.warn(
        `[PARSE] Aucun produit "products" pour "${item.productName}"`
      );
      continue;
    }

    const linePrice = product.base_price * item.quantity;

    orderItemsPayload.push({
      order_id: orderId,
      product_id: product.id,
      qty: item.quantity,
      unit_price: product.base_price,
    });

    totalQty += item.quantity;
    totalPrice += linePrice;
  }

  if (!orderItemsPayload.length) {
    console.warn("[ORDER_ITEMS] Aucun item à insérer (tout a été filtré).");
    return;
  }

  const { error: insertItemsError } = await supabaseAdmin
    .from("order_items")
    .insert(orderItemsPayload);

  if (insertItemsError) {
    console.error("[ORDER_ITEMS INSERT ERROR]", insertItemsError);
  }

  const { error: updateOrderError } = await supabaseAdmin
    .from("orders")
    .update({
      total: totalQty,
      total_price: totalPrice,
    })
    .eq("id", orderId);

  if (updateOrderError) {
    console.error("[ORDERS UPDATE TOTALS ERROR]", updateOrderError);
  }

  if (DEBUG) {
    console.log("[ORDER_ITEMS] Créés", {
      orderId,
      totalQty,
      totalPrice,
      items: orderItemsPayload,
    });
  }
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
      input: ["speech"], // tableau de modes d'entrée
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

    // 2.a) Parsing texte -> items
    const parsedItems = parseFrenchOrder(effectiveTranscript);

    if (DEBUG) {
      console.log("📝 [VOICE-AI-PLUS TWILIO] SpeechResult:", {
        effectiveTranscript,
      });
      console.log("🧩 [VOICE-AI-PLUS TWILIO] Parsed items:", parsedItems);
    }

    // 2.b) Client
    const { clientId, clientName } = await ensureClientForPhone(from);

    if (DEBUG) {
      console.log("👤 [VOICE-AI-PLUS TWILIO] Client", { clientId, clientName });
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

    // 2.d) Préparation de la note pour orders (on ajoute le parse lisible)
    const parsedSummary =
      parsedItems.length > 0
        ? ` | Items: ${parsedItems
            .map((i) => `${i.quantity}x ${i.productName}`)
            .join(", ")}`
        : "";

    const baseNote =
      transcriptStatusNote && transcriptStatusNote.length > 0
        ? `${effectiveTranscript} (${callTag}, ${transcriptStatusNote})`
        : `${effectiveTranscript} (${callTag})`;

    const noteForOrder = `${baseNote}${parsedSummary}`;

    // 2.e) Création commande minimale dans orders (total = 0 au départ)
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

    // 2.f) Si on a une commande + des items parsés, on crée les order_items
    if (order && !orderError && parsedItems.length > 0) {
      await createOrderItemsFromParsed({
        orderId: order.id,
        items: parsedItems,
      });
    }

    // 2.g) Réponse vocale simple (sans LLM)
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
