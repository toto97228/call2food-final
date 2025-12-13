// lib/parseOrderWithGemini.ts
import { geminiOrderModel } from "./geminiClient";

export type ParsedOrderItem = {
  product: string;   // ex: "Margarita"
  qty: number;       // ex: 2
};

export async function parseOrderWithGemini(
  transcript: string
): Promise<ParsedOrderItem[]> {
  const prompt = `
Tu es un assistant pour fast food qui vend des pizzas et autres.
À partir de la phrase du client (en français),
retourne uniquement un JSON strict de ce type:

{
  "items": [
    { "product": "Margarita", "qty": 1 },
    { "product": "Reine", "qty": 2 }
  ]
}

Règles:
- "Margarita" ou "Margherita" -> "Margarita"
- "Reine" -> "Reine"
- "3 fromages" / "trois fromages" / "3 fromages de Rennes" -> "3 Fromages"
- Ignore les détails non essentiels (salutations, merci, etc.).
- Si tu n'es pas sûr, mets quand même ton meilleur effort.
- Ne réponds qu'avec le JSON, sans texte autour.

Texte du client:
"${transcript}"
`;

  const result = await geminiOrderModel.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const parsed = JSON.parse(text) as { items?: ParsedOrderItem[] };
    return parsed.items ?? [];
  } catch (e) {
    console.error("[GEMINI PARSE ERROR]", e, "raw:", text);
    return [];
  }
}
