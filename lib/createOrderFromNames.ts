import { supabaseAdmin } from '@/lib/supabaseAdmin';

type ItemFromVoice = {
  name: string;
  quantity: number;
};

function normalize(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function createOrderFromNames(params: {
  phone: string;
  items: ItemFromVoice[];
  notes?: string | null;
  callId: string;
}) {
  const { phone, items, notes, callId } = params;

  // 1) Idempotence simple via voice_orders
  const { data: existingLog } = await supabaseAdmin
    .from('voice_orders')
    .select('id')
    .ilike('speech_result', `%CALL=${callId}%`)
    .maybeSingle();

  if (existingLog) {
    return { ok: true, duplicated: true };
  }

  // 2) Client
  const { data: existingClient } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  let clientId = existingClient?.id;

  if (!clientId) {
    const { data: inserted } = await supabaseAdmin
      .from('clients')
      .insert({ name: `Client ${phone}`, phone })
      .select('id')
      .single();

    clientId = inserted!.id;
  }

  // 3) Produits disponibles
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name, base_price')
    .eq('available', true);

  if (!products || products.length === 0) {
    throw new Error('no_products_available');
  }

  const productMap = new Map(
    products.map(p => [normalize(p.name), p])
  );

  // 4) Mapping items
  let total = 0;
  const orderItems: any[] = [];

  for (const item of items) {
    const product = productMap.get(normalize(item.name));
    if (!product) {
      throw new Error(`unknown_product:${item.name}`);
    }

    const price = Number(product.base_price);
    total += price * item.quantity;

    orderItems.push({
      product_id: product.id,
      qty: item.quantity,
      unit_price: price,
    });
  }

  // 5) Order
  const { data: order } = await supabaseAdmin
    .from('orders')
    .insert({
      client_id: clientId,
      status: 'new',
      note: notes ?? null,
      total,
      total_price: total,
    })
    .select('id')
    .single();

  // 6) Items
  await supabaseAdmin
    .from('order_items')
    .insert(orderItems.map(i => ({ ...i, order_id: order!.id })));

  // 7) Log voix
  await supabaseAdmin.from('voice_orders').insert({
    from_number: phone,
    speech_result: `CALL=${callId}`,
  });

  return { ok: true, order_id: order!.id, total };
}
