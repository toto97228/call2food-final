// lib/aiOrderParser.ts
import "server-only";

export type OrderItem = {
  product: string;
  quantity: number;
};

export type ParsedOrder = {
  items: OrderItem[];
};

/**
 * Appelle l'API OpenAI pour analyser une phrase de commande
 * en français et renvoyer une structure JSON.
 */
export async function parseOrderWithAI(
  transcript: string
): Promise<ParsedOrder | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("OPENAI_API_KEY manquante dans les variables d'environnement");
    return null;
  }

  // Prompt très simple pour l’instant : pizzas uniquement
  const systemPrompt = `
Tu es un assistant pour un food truck de pizzas.
À partir d'une phrase en français (souvent orale et un peu brouillonne),
tu dois extraire la commande sous forme de JSON strict, sans texte autour.

Règles :
- Les produits possibles sont : "Margarita", "Reine", "4 fromages",
  "Chèvre miel", "4 saisons", "Diavola", "Savoyarde".
- Corrige l'orthographe si le client se trompe ("marguerita" -> "Margarita").
- S'il ne précise pas la quantité, mets 1.
- Tu peux renvoyer plusieurs pizzas dans la même commande.

Format de réponse OBLIGATOIRE (JSON strict) :
{
  "items": [
    { "product": "Margarita", "quantity": 2 },
    { "product": "4 fromages", "quantity": 1 }
  ]
}
`.trim();

  const userPrompt = `Texte du client : """${transcript}"""`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini", // modèle léger et pas cher :contentReference[oaicite:0]{index=0}
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    console.error("Erreur OpenAI:", await response.text());
    return null;
  }

  const data = await response.json();

  const content = data.choices?.[0]?.message?.content;
  console.log(">>> Réponse OpenAI brute :", content);
  if (typeof content !== "string") {
    console.error("Réponse OpenAI sans contenu texte:", data);
    return null;
  }

  try {
    const parsed = JSON.parse(content) as ParsedOrder;
    if (!parsed.items || !Array.isArray(parsed.items)) {
      console.error("JSON retourné sans items:", parsed);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("Impossible de parser le JSON de l'IA:", err, content);
    return null;
  }
}
