// lib/voiceParser.ts

export type ParsedItem = {
  productKey: string;
  productName: string;
  quantity: number;
};

// Mots pour les chiffres en français
const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  "1": 1,
  deux: 2,
  "2": 2,
  trois: 3,
  "3": 3,
  quatre: 4,
  "4": 4,
  cinq: 5,
  "5": 5,
  six: 6,
  "6": 6,
  sept: 7,
  "7": 7,
  huit: 8,
  "8": 8,
  neuf: 9,
  "9": 9,
  dix: 10,
  "10": 10,
};

// Liste des pizzas connues
const PRODUCTS = [
  {
    key: "margarita",
    label: "Margarita",
    patterns: ["margarita", "margherita", "marguerita"],
  },
  {
    key: "reine",
    label: "Reine",
    patterns: ["reine", "regina"],
  },
  {
    key: "4-fromages",
    label: "4 fromages",
    patterns: ["4 fromages", "quatre fromages", "4 fromage", "quatre fromage"],
  },
  {
    key: "chevre-miel",
    label: "Chèvre miel",
    patterns: ["chevre miel", "chèvre miel", "chevre et miel"],
  },
  {
    key: "4-saisons",
    label: "4 saisons",
    patterns: ["4 saisons", "quatre saisons"],
  },
  {
    key: "diavola",
    label: "Diavola",
    patterns: ["diavola", "diavolo", "diable"],
  },
  {
    key: "savoyarde",
    label: "Savoyarde",
    patterns: ["savoyarde"],
  },
];

// Normalisation : minuscules, sans accents, sans ponctuation
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // supprime les accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // enlève la ponctuation
    .replace(/\s+/g, " ") // espaces multiples
    .trim();
}

// Trouve une quantité dans un morceau de phrase
function extractQuantity(segmentNorm: string): number {
  // 1) nombre en chiffres
  const digitMatch = segmentNorm.match(/\b(\d+)\b/);
  if (digitMatch) {
    const q = parseInt(digitMatch[1], 10);
    if (!isNaN(q) && q > 0) return q;
  }

  // 2) nombre en lettres
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(segmentNorm)) {
      return value;
    }
  }

  // Par défaut : 1 pizza
  return 1;
}

// Trouve une pizza dans un morceau de phrase
function extractProduct(segmentNorm: string): { productKey: string; productName: string } | null {
  for (const product of PRODUCTS) {
    for (const pattern of product.patterns) {
      const patternNorm = normalize(pattern);
      const regex = new RegExp(`\\b${patternNorm}\\b`);
      if (regex.test(segmentNorm)) {
        return {
          productKey: product.key,
          productName: product.label,
        };
      }
    }
  }
  return null;
}

/**
 * Analyse une phrase comme :
 *  - "Je souhaiterais une pizza margarita et 2 4 fromages"
 *  - "2 margarita"
 *  Renvoie pour l'instant **seulement le premier item détecté**.
 */
export function parseVoiceOrder(text: string): ParsedItem | null {
  if (!text) return null;

  const normalized = normalize(text);
  if (!normalized) return null;

  // On découpe sur "et" / virgules pour trouver plusieurs items
  const segments = normalized.split(/\bet\b|,/g).map((s) => s.trim());

  for (const segment of segments) {
    if (!segment) continue;

    const product = extractProduct(segment);
    if (!product) continue;

    const quantity = extractQuantity(segment);

    const parsed: ParsedItem = {
      productKey: product.productKey,
      productName: product.productName,
      quantity,
    };

    console.log("[voiceParser] Segment:", segment, "→", parsed);
    return parsed; // Pour l’instant on garde seulement le premier produit trouvé
  }

  console.log("[voiceParser] Aucun produit détecté dans :", normalized);
  return null;
}
