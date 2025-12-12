// app/api/voice-ai-plus/route.ts
import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  parseOrderWithGemini,
  ParsedOrderItem,
} from "@/lib/parseOrderWithGemini";

export const runtime = "nodejs"; // important pour utiliser le SDK Twilio

const DEBUG = true;
const VoiceResponse = twilio.twiml.VoiceResponse;

/* --------------------------------------------- */
/* Types internes                                */
/* --------------------------------------------- */

type ParsedItem = {
  productName: string; // doit correspondre à products.name
  quantity: number;
};

type DbProduct = {
  id: number;
  name: string;
  base_price: any;
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

//
// ATTENTION : ici je mappe les mots parlés -> NOMS EXACTS de ta table products
// Table actuelle : "Margherita", "Supplément jambon", "3 Fromages", "reine"
//
const PRODUCT_KEYWORDS: { key: string; label: string }[] = [
  { key: "margarita", label: "Margherita" },
  { key: "margherita", label: "Margherita" },

  { key: "reine", label: "reine" },

  { key: "4 fromages", label: "3 Fromages" },
  { key: "quatre fromages", label: "3 Fromages" },
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
 * Exemple géré (fallback) :
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
/* Création des order_items + mise à jour total  */
/* --------------------------------------------- */
async function createOrderItemsAndUpdateTotals(params: {
  orderId: string;
  parsedItems: ParsedItem[];
}) {
  const { orderId, parsedItems } = params;

  if (!parsedItems.length) {
    if (DEBUG) {
      console.log("[ORDER_ITEMS] aucun item parsé, rien à créer");
    }
    return;
  }

  const names = Array.from(
    new Set(parsedItems.map((i) => i.productName).filter(Boolean))
  );
  if (!names.length) return;

  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, name, base_price")
    .in("name", names);

  if (productsError || !products || products.length === 0) {
    console.error("[PRODUCTS LOOKUP ERROR]", productsError);
    return;
  }

  const productByName = new Map<string, DbProduct>();
  for (const p of products as DbProduct[]) {
    productByName.set(p.name, p);
  }

  const orderItemsToInsert: {
    order_id: string;
    product_id: number;
    qty: number;
    unit_price: number;
  }[] = [];

  let total = 0;

  for (const item of parsedItems) {
    const product = productByName.get(item.productName);
    if (!product) {
      console.warn("[ORDER_ITEMS WARNING] Produit inconnu:", item.productName);
      continue;
    }

    const unitPrice = Number(product.base_price ?? 0) || 0;
    const lineTotal = unitPrice * item.quantity;

    orderItemsToInsert.push({
      order_id: orderId,
      product_id: product.id,
      qty: item.quantity,
      unit_price: unitPrice,
    });

    total += lineTotal;
  }

  if (!orderItemsToInsert.length) {
    if (DEBUG) {
      console.log("[ORDER_ITEMS] aucun item valide pour insertion");
    }
    return;
  }

  const { error: insertItemsError } = await supabaseAdmin
    .from("order_items")
    .insert(orderItemsToInsert);

  if (insertItemsError) {
    console.error("[ORDER_ITEMS INSERT ERROR]", insertItemsError);
  }

  const { error: updateOrderError } = await supabaseAdmin
    .from("orders")
    .update({
      total,
      total_price: total,
    })
    .eq("id", orderId);

  if (updateOrderError) {
    console.error("[ORDER TOTAL UPDATE ERROR]", updateOrderError);
  }

  if (DEBUG) {
    console.log("[ORDER_ITEMS] inserted + totals updated", {
      orderId,
      total,
      items: orderItemsToInsert.length,
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

    // 2.a) Parsing avec GEMINI -> items
    let parsedItems: ParsedItem[] = [];

    try {
      const geminiItems: ParsedOrderItem[] = await parseOrderWithGemini(
        effectiveTranscript
      );

      parsedItems = geminiItems
        .filter(
          (i) =>
            i.product &&
            typeof i.product === "string" &&
            i.product.trim().length > 0 &&
            typeof i.qty === "number" &&
            i.qty > 0
        )
        .map((i) => ({
          productName: i.product.trim(),
          quantity: i.qty,
        }));

      if (DEBUG) {
        console.log("🧠 [GEMINI PARSE] items:", geminiItems);
        console.log("🧠 [GEMINI → ParsedItem] mapped:", parsedItems);
      }
    } catch (e) {
      console.error("[GEMINI PARSE EXCEPTION]", e);
    }

    // Fallback sur parseur naïf si Gemini ne renvoie rien d'exploitable
    if (parsedItems.length === 0) {
      const fallbackItems = parseFrenchOrder(effectiveTranscript);
      parsedItems = fallbackItems;
      if (DEBUG) {
        console.log(
          "🔁 [FALLBACK] parseFrenchOrder utilisé, items:",
          fallbackItems
        );
      }
    }

    if (DEBUG) {
      console.log("📝 [VOICE-AI-PLUS TWILIO] SpeechResult:", {
        effectiveTranscript,
      });
      console.log("🧩 [VOICE-AI-PLUS TWILIO] Parsed items (final):", parsedItems);
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

    // 2.e) Création commande minimale dans orders
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

    // 2.f) Création des order_items + total si on a une commande et des items parsés
    if (!orderError && order && parsedItems.length > 0) {
      await createOrderItemsAndUpdateTotals({
        orderId: (order as any).id,
        parsedItems,
      });
    }

    // 2.g) Réponse vocale simple (sans LLM côté Twilio)
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
