// lib/aiOrderParser.ts
import OpenAI from 'openai';

/**
 * Flags d’activation
 * - USE_OPENAI = 'true' -> utilise OpenAI (plus tard, quand tu auras du crédit)
 * - USE_DEEPSEEK = 'true' -> utilise DeepSeek (actuel)
 * - si aucun n’est actif -> mode MOCK
 */
const USE_OPENAI = process.env.USE_OPENAI === 'true';
const USE_DEEPSEEK = process.env.USE_DEEPSEEK === 'true';

if (process.env.NODE_ENV !== 'production') {
  console.log('USE_OPENAI =', USE_OPENAI, 'USE_DEEPSEEK =', USE_DEEPSEEK);
}

/**
 * Clients éventuels
 */
let openaiClient: OpenAI | null = null;
if (USE_OPENAI && process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  });
}

// DeepSeek se fait via fetch compatible OpenAI
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

/**
 * Types
 */
export type ParsedItem = {
  product_id: number;
  quantity: number;
};

export type ParsedOrder = {
  phone_number: string;
  client_name: string;          // tu mets toujours "Client inconnu" au minimum
  items: ParsedItem[];
  notes?: string | null;        // peut être string, null ou undefined
  source: 'twilio' | 'test';
  raw_transcript: string;
  needs_human: boolean;
  /**
   * Optionnel : moteur utilisé pour le parsing
   * ex: "deepseek" ou "openai"
   */
  engine?: string;
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
    lower.includes("un humain s il vous plait") ||
    lower.includes("parler au patron") ||
    lower.includes("parler au responsable")
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
 * Parser MOCK sans appeler un LLM
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
      transcript.match(/(.*?)(supplément jambon|supplement jambon|avec jambon)/i)
        ?.[1] ?? transcript,
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
 * Appel DeepSeek – mode JSON "turbo"
 * - JSON strict via response_format = { type: 'json_object' }
 * - max_tokens bas pour limiter la latence
 * - temperature = 0 pour une réponse courte et déterministe
 */
async function callDeepSeekForOrder(
  phoneNumber: string,
  transcript: string,
): Promise<ParsedOrder> {
  if (!DEEPSEEK_API_KEY) {
    console.warn('[DeepSeek] DEEPSEEK_API_KEY manquant, fallback MOCK');
    return mockParseOrder(phoneNumber, transcript);
  }

  const needsHuman = detectNeedsHuman(transcript);

  const systemPrompt = `
Tu es un assistant de prise de commande pour un restaurant de pizzas et sushis.
Tu dois analyser les demandes vocales des clients et renvoyer STRICTEMENT un JSON valide (pas de texte avant/après).

Tu dois toujours répondre en JSON (mot "json" obligatoire dans ces instructions).

Exemple de format JSON attendu :

{
  "phone_number": "+33123456789",
  "client_name": "Antony",
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 3, "quantity": 1 }
  ],
  "notes": "sans oignons, bien cuite"
}

Règles :
- "phone_number" = le numéro fourni (ne l'invente pas).
- "client_name" = nom du client si mentionné, sinon "Client inconnu".
- "items" = tableau de produits avec:
    - product_id: 1 = Pizza Margherita
    - product_id: 2 = Supplément jambon
    - product_id: 3 = Pizza 3 Fromages
- "quantity" = nombre de chaque produit (1 si non précisé, ou déduit du texte).
- "notes" = texte libre pour la cuisine (ex: "sans oignons, bien cuite").

IMPORTANT : réponds uniquement un json valide correspondant à ce schéma. Pas de texte autour.
`;

  const userPrompt = `
Numéro de téléphone: ${phoneNumber}
Texte du client:
"""${transcript}"""
`;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 256,
        stream: false,
      }),
      // petit timeout global côté Node (en pratique géré ailleurs si besoin)
    });

    if (!response.ok) {
      console.error(
        '[DeepSeek] HTTP error',
        response.status,
        await response.text().catch(() => ''),
      );
      return mockParseOrder(phoneNumber, transcript);
    }

    const json = (await response.json()) as any;
    const content: string | undefined =
      json?.choices?.[0]?.message?.content ?? undefined;

    if (!content || typeof content !== 'string') {
      console.error('[DeepSeek] Réponse sans content exploitable:', json);
      return mockParseOrder(phoneNumber, transcript);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('[DeepSeek] Erreur JSON.parse sur content, fallback MOCK:', e);
      return mockParseOrder(phoneNumber, transcript);
    }

    return {
      phone_number: parsed.phone_number ?? phoneNumber,
      client_name: parsed.client_name ?? 'Client inconnu',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notes: parsed.notes ?? undefined,
      source: 'twilio',
      raw_transcript: transcript,
      needs_human: needsHuman,
    };
  } catch (err) {
    console.error('[DeepSeek] Exception réseau ou autre, fallback MOCK:', err);
    return mockParseOrder(phoneNumber, transcript);
  }
}

/**
 * Appel OpenAI "classique" (pour plus tard quand tu auras du crédit)
 * On le garde mais ce n’est pas utilisé actuellement.
 */
async function callOpenAIForOrder(
  phoneNumber: string,
  transcript: string,
): Promise<ParsedOrder> {
  if (!openaiClient) {
    return mockParseOrder(phoneNumber, transcript);
  }

  const needsHuman = detectNeedsHuman(transcript);

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

  try {
    const response = await openaiClient.responses.create({
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
      console.error('Erreur de parsing JSON (OpenAI), fallback MOCK:', err);
      return mockParseOrder(phoneNumber, transcript);
    }

    return {
      phone_number: parsed.phone_number ?? phoneNumber,
      client_name: parsed.client_name ?? 'Client inconnu',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notes: parsed.notes ?? undefined,
      source: 'twilio',
      raw_transcript: transcript,
      needs_human: needsHuman,
    };
  } catch (err) {
    console.error('Erreur appel OpenAI, fallback MOCK:', err);
    return mockParseOrder(phoneNumber, transcript);
  }
}

/**
 * Route interne : choisit le "meilleur" moteur disponible
 * Priorité : DeepSeek -> OpenAI -> MOCK
 */
async function callModelForOrder(
  phoneNumber: string,
  transcript: string,
): Promise<ParsedOrder> {
  if (USE_DEEPSEEK) {
    return callDeepSeekForOrder(phoneNumber, transcript);
  }

  if (USE_OPENAI) {
    return callOpenAIForOrder(phoneNumber, transcript);
  }

  return mockParseOrder(phoneNumber, transcript);
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
