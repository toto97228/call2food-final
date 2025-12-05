// voice-gateway/aiOrderParser.js

import type { ParsedOrder } from '../lib/aiOrderParser';


const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL || 'http://localhost:3000';

/**
 * orderPayload doit ressembler à :
 * {
 *   client_phone: "+12148386556",
 *   client_name?: "Tony",
 *   items: [
 *     { product_id: 1, qty: 2 },
 *     { product_id: 3, qty: 1 }
 *   ]
 * }
 */
async function handleFinalAiOrder(orderPayload: ParsedOrder) {

  try {
    console.log('🧾 handleFinalAiOrder reçu :', orderPayload);

    // Validation minimale
    if (
  !orderPayload ||
  !orderPayload.phone_number ||
  !Array.isArray(orderPayload.items) ||
  orderPayload.items.length === 0
) {
      console.error('❌ Payload de commande invalide', orderPayload);
      return { ok: false, error: 'invalid_order_payload' };
    }

    const response = await fetch(`${BACKEND_BASE_URL}/api/voice/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await response
      .json()
      .catch(() => ({ error: 'invalid_json_response' }));

    if (!response.ok) {
      console.error('❌ Erreur API /api/voice/orders', response.status, data);
      return {
        ok: false,
        status: response.status,
        error: data?.error || 'orders_api_error',
      };
    }

    console.log('✅ Commande créée dans le backend :', data);
    return { ok: true, data };
  } catch (err) {
    console.error('❌ Exception dans handleFinalAiOrder', err);
    return { ok: false, error: 'exception', details: String(err) };
  }
}

module.exports = {
  handleFinalAiOrder,
};
