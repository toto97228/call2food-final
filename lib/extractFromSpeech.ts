// lib/extractFromSpeech.ts

export type ParsedItem = {
  product_id: number;
  quantity: number;
  name: string;
};

export type ParsedSpeech = {
  items: ParsedItem[];
  note: string;
};

/**
 * Nettoyer la phrase : minuscules, accents retirés, espaces en trop
 */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convertit "un", "deux", "trois" → 1, 2, 3
 */
const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
};

/**
 * Extrait les items demandés depuis la phrase utilisateur
 * en se basant sur les noms produits contenus en base.
 */
export function extractFromSpeech(
  speech: string,
  products: { id: number; name: string }[]
): ParsedSpeech {
  const clean = normalize(speech);

  const items: ParsedItem[] = [];

  for (const p of products) {
    const cleanName = normalize(p.name);

    // si le nom du produit n'apparaît pas dans la phrase, on ignore
    if (!clean.includes(cleanName)) continue;

    // Cherche un nombre juste avant le nom du produit (ex: "2 quatre fromages")
    const regex = new RegExp(
      `(\\d+|un|une|deux|trois|quatre|cinq)\\s+${cleanName}`
    );
    const match = clean.match(regex);

    let qty = 1;
    if (match) {
      const rawQty = match[1];
      qty = NUMBER_WORDS[rawQty] ?? parseInt(rawQty, 10) || 1;
    }

    items.push({
      product_id: p.id,
      quantity: qty,
      name: p.name,
    });
  }

  return {
    items,
    note: speech,
  };
}
