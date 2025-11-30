// app/api/voice/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type OrderItemInput = {
  product_id: number; // entier (id de products)
  qty: number;
};

type CreateOrderBody = {
  client_phone: string;
  client_name?: string;
  items: OrderItemInput[];
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateOrderBody;

    // --- Validation simple ---
    if (!body.client_phone || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'client_phone et items sont obligatoires' },
        { status: 400 },
      );
    }

    // --- 1. Upsert client ---
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .upsert(
        {
          phone: body.client_phone,
          name: body.client_name ?? `Client ${body.client_phone}`,
        },
        { onConflict: 'phone' },
      )
      .select('*')
      .single();

    if (clientError || !client) {
      console.error('clientError', clientError);
      return NextResponse.json({ error: 'Erreur upsert client' }, { status: 500 });
    }

    // --- 2. Récupérer les produits concernés ---
    const productIds = [...new Set(body.items.map((i) => i.product_id))];

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, base_price, available')
      .in('id', productIds);

    if (productsError || !products || products.length === 0) {
      console.error('productsError', productsError);
      return NextResponse.json(
        { error: 'Produits introuvables' },
        { status: 400 },
      );
    }

    // --- 3. Calcul du total ---
    let totalPrice = 0;
    const itemsToInsert: {
      product_id: number;
      qty: number;
      unit_price: number;
    }[] = [];

    for (const item of body.items) {
      const product = products.find((p) => p.id === item.product_id);

      if (!product) {
        return NextResponse.json(
          { error: `Produit ${item.product_id} introuvable` },
          { status: 400 },
        );
      }

      const unitPrice = Number((product as any).base_price ?? 0);
      totalPrice += unitPrice * item.qty;

      itemsToInsert.push({
        product_id: item.product_id,
        qty: item.qty,
        unit_price: unitPrice,
      });
    }

    // --- 4. Créer la commande ---
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        client_id: client.id,
        status: 'new',
        total_price: totalPrice,
      })
      .select('*')
      .single();

    if (orderError || !order) {
      console.error('orderError', orderError);
      return NextResponse.json(
        { error: 'Erreur création commande' },
        { status: 500 },
      );
    }

    // --- 5. Créer les lignes de commande ---
    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(
        itemsToInsert.map((i) => ({
          order_id: order.id,
          product_id: i.product_id,
          qty: i.qty,
          unit_price: i.unit_price,
        })),
      );

    if (itemsError) {
      console.error('itemsError', itemsError);
      return NextResponse.json(
        { error: 'Erreur création lignes de commande' },
        { status: 500 },
      );
    }

    // --- OK ---
    return NextResponse.json(
      {
        ok: true,
        order_id: order.id,
        total_price: totalPrice,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('Unexpected error in /api/voice/orders', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
