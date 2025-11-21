import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ParsedOrder = {
  productName: string | null;
  quantity: number | null;
};

// Normalise le texte (minuscules, enlève accents, etc.)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// Détecte la quantité dans la phrase (1, 2, 3...)
function detectQuantity(text: string): number {
  const normalized = normalizeText(text);

  // chiffres
  const numberMatch = normalized.match(/\b(\d+)\b/);
  if (numberMatch) {
    const num = parseInt(numberMatch[1], 10);
    if (!Number.isNaN(num) && num > 0 && num < 20) return num;
  }

  // mots en français
  const quantityWords: Record<string, number> = {
    un: 1,
    une: 1,
    "une pizza": 1,
    "une margarita": 1,
    deux: 2,
    "deux pizzas": 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
  };

  for (const [word, value] of Object.entries(quantityWords)) {
    if (normalized.includes(word)) return value;
  }

  // par défaut 1
  return 1;
}

// Détecte le nom de pizza dans la phrase
function detectProductName(text: string): string | null {
  const normalized = normalizeText(text);

  const products = [
    { key: "margarita", label: "Margarita" },
    { key: "margherita", label: "Margarita" }, // au cas où
    { key: "reine", label: "Reine" },
    { key: "4 fromages", label: "4 fromages" },
    { key: "quatre fromages", label: "4 fromages" },
    { key: "chevre miel", label: "Chèvre miel" },
    { key: "chavre miel", label: "Chèvre miel" }, // erreurs possibles
    { key: "4 saisons", label: "4 saisons" },
    { key: "quatre saisons", label: "4 saisons" },
    { key: "diavola", label: "Diavola" },
    { key: "savoyarde", label: "Savoyarde" },
  ];

  for (const product of products) {
    if (normalized.includes(product.key)) {
      return product.label;
    }
  }

  return null;
}

// Analyse complète d'une phrase
function parseOrder(text: string): ParsedOrder {
  const quantity = detectQuantity(text);
  const productName = detectProductName(text);

  return { quantity, productName };
}

export async function POST(req: Request) {
  const formData = await req.formData();

  const speechResultRaw = formData.get("SpeechResult")?.toString() ?? "";
  const fromNumber = formData.get("From")?.toString() ?? null;

  console.log("Texte brut Twilio :", speechResultRaw);
  console.log("Numéro appelant :", fromNumber);

  const { quantity, productName } = parseOrder(speechResultRaw);

  console.log("Commande interprétée :", {
    quantity,
    productName,
  });

  // Insertion dans Supabase
  const { error } = await supabaseAdmin.from("voice_orders").insert({
    from_number: fromNumber,
    speech_result: speechResultRaw,
    product_name: productName,
    quantity: quantity,
  });

  if (error) {
    console.error("Erreur Supabase voice_orders :", error);

    const errorTwiml = `
<Response>
  <Say voice="alice" language="fr-FR">
    Désolé, une erreur est survenue lors de l'enregistrement de votre commande.
  </Say>
  <Hangup />
</Response>
`;

    return new NextResponse(errorTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Réponse personnalisée si on a compris la pizza
  let responseText: string;

  if (productName) {
    const qty = quantity ?? 1;
    const pizzasWord = qty > 1 ? "pizzas" : "pizza";

    responseText = `Merci ! J'ai bien reçu votre commande de ${qty} ${pizzasWord} ${productName}.`;
  } else {
    responseText = `Merci ! J'ai bien reçu votre commande, mais je n'ai pas bien compris le type de pizza.`;
  }

  const twiml = `
<Response>
  <Say voice="alice" language="fr-FR">
    ${responseText}
  </Say>
  <Hangup />
</Response>
`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET() {
  const twiml = `
<Response>
  <Say voice="alice" language="fr-FR">
    Cette route n'accepte que les requêtes POST.
  </Say>
</Response>
`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
