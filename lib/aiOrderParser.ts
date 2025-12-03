// lib/aiOrderParser.ts
import OpenAI from 'openai';

const USE_OPENAI = process.env.USE_OPENAI === 'true';

let client: OpenAI | null = null;
if (USE_OPENAI) {
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });
}

/**
 * Types
 */
export type ParsedItem = {
  product_id: number;
  quantity: number;
};

export type ParsedOrder = {
  phone_number: string;
  client_name: string;
  items: ParsedItem[];
  notes?: string;
  source: 'twilio' | 'test';
  raw_transcript: string;
  needs_human: boolean;
};

/**
 * Détection simple : le client veut parler à un humain
 */
function detectNeedsHuman(transcript: string): boolean {
  const lower = transcript.toLowerCase();

  return (
    lower.includes("parler à un humain") ||
    lower.includes("parler a un humain") ||
    lower.includes("parler à quelqu'un") ||
    lower.includes("parler a quelqu'un") ||
    lower.includes("parler à une personne") ||
    lower.includes("parler a une personne") ||
    lower.includes("un humain s'il vous plaît") ||
    lower.includes("un humain s il vous plait")
  );
}

/**
 * Petit utilitaire pour détecter une quantité
 * - nombres (1,2,3…)
 * - mots simples: un/une/deux/trois/quatre
 */
function detectQuantity(text: string, defaultQty = 1): number {
  const lower = text.toLowerCase();

  // nombres "2", "3", etc.
  const numberMatch = lower.match(/(\d+)\s*(x|fois)?/);
  if (numberMatch) {
    const n = parseInt(numberMatch[1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  // mots
  const words: Record<string, number> = {
    un: 1,
    une: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
  };

  for (const [word, val] of Object.entries(words)) {
    if (lower.includes(word)) {
      return val;
    }
  }

  return defaultQty;
}

/**
 * Parser MOCK sans appeler OpenAI
 * Adapté à tes produits actuels:
 * 1 = Margherita
 * 2 = Supplément jambon
 * 3 = 3 Fromages
 */
function mockParseOrder(phoneNumber: string, transcript: string): ParsedOrder {
  const lower = transcript.toLowerCase();
  const items: ParsedItem[] = [];

  // Pizza Margherita
  if (
    lower.includes('margherita') ||
    lower.includes('margarita') // au cas où l'orthographe varie
  ) {
    const qty = detectQuantity(
      transcript.match(/(.*?)(margherita|margarita)/i)?.[1] ?? transcript,
      1,
    );
    items.push({
      product_id: 1,
      quantity: qty,
    });
  }

  // 3 Fromages
  if (lower.includes('3 fromages') || lower.includes('trois fromages')) {
    const qty = detectQuantity(
      transcript.match(/(.*?)(3 fromages|trois fromages)/i)?.[1] ?? transcript,
      1,
    );
    items.push({
      product_id: 3,
      quantity: qty,
    });
  }

  // Supplément jambon
  if (
    lower.includes('supplément jambon') ||
    lower.includes('supplement jambon') ||
    lower.includes('avec jambon')
  ) {
    const qty = detectQuantity(
      transcript.match(/(.*?)(supplément jambon|supplement jambon|avec jambon)/i)?.[1] ??
        transcript,
      1,
    );
    items.push({
      product_id: 2,
      quantity: qty,
    });
  }

  // Notes : on récupère les morceaux après "sans", "bien cuit", etc. très simplement
  let notes = '';
  if (lower.includes('sans')) {
    const afterSans = transcript.split(/sans/i)[1];
    if (afterSans) {
      notes += 'sans ' + afterSans.trim();
    }
  }
  if (lower.includes('bien cuit') || lower.includes('bien cuite')) {
    notes = notes ? notes + ', bien cuit(e)' : 'bien cuit(e)';
  }

  const needsHuman = detectNeedsHuman(transcript);

  return {
    phone_number: phoneNumber,
    client_name: 'Client inconnu',
    items,
    notes: notes || undefined,
    source: 'twilio',
    raw_transcript: transcript,
    needs_human: needsHuman,
  };
}

/**
 * Appel du vrai modèle OpenAI (quand USE_OPENAI === 'true').
 * Sinon on repasse sur mockParseOrder.
 */
async function callModelForOrder(
  phoneNumber: string,
  transcript: string,
): Promise<ParsedOrder> {
  if (!USE_OPENAI || !client) {
    // MODE MOCK (ce sera ton cas actuel)
    return mockParseOrder(phoneNumber, transcript);
  }

  // --- MODE RÉEL (pour plus tard quand tu auras un plan) ---
  const prompt = `
Tu es un assistant de prise de commande pour un restaurant.
Tu dois renvoyer UNIQUEMENT un JSON valide (aucun texte autour).

Format attendu :

{
  "phone_number": "string",
  "client_name": "string",
  "items": [
    { "product_id": number, "quantity": number }
  ],
  "notes": "string optionnelle"
}

Texte du client :
"""${transcript}"""

Numéro de téléphone : ${phoneNumber}
`;

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
  });

  const firstOutput: any = response.output?.[0];
  const firstContent: any = firstOutput?.content?.[0];
  const rawText: string = firstContent?.text ?? '';

  let parsed: any;
  try {
    let jsonString = rawText.trim();
    const firstBrace = jsonString.indexOf('{');
    const lastBrace = jsonString.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      jsonString = jsonString.slice(firstBrace, lastBrace + 1);
    }
    parsed = JSON.parse(jsonString);
  } catch (err) {
    console.error('Erreur de parsing JSON (OpenAI), fallback en mode mock:', err);
    return mockParseOrder(phoneNumber, transcript);
  }

  const needsHuman = detectNeedsHuman(transcript);

  return {
    phone_number: parsed.phone_number ?? phoneNumber,
    client_name: parsed.client_name ?? 'Client inconnu',
    items: Array.isArray(parsed.items) ? parsed.items : [],
    notes: parsed.notes ?? undefined,
    source: 'twilio',
    raw_transcript: transcript,
    needs_human: needsHuman,
  };
}

/**
 * Pour /api/orders (tests ou texte libre)
 */
export async function parseOrderWithAI(params: {
  phoneNumber: string;
  text: string;
  source?: 'twilio' | 'test';
}): Promise<ParsedOrder> {
  const { phoneNumber, text, source = 'test' } = params;

  const base = await callModelForOrder(phoneNumber, text);

  return {
    ...base,
    source,
    raw_transcript: text,
  };
}

/**
 * Pour /api/voice (commande vocale depuis Twilio)
 */
export async function parseVoiceOrder(params: {
  phoneNumber: string;
  transcript: string;
}): Promise<ParsedOrder> {
  const { phoneNumber, transcript } = params;

  const base = await callModelForOrder(phoneNumber, transcript);

  return {
    ...base,
    source: 'twilio',
    raw_transcript: transcript,
  };
}
