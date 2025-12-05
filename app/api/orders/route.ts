// app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type CreateOrderItemInput = {
  product_id: number;   // chez toi: 1, 2, 3...
  quantity: number;
  notes?: string | null;
};

type CreateOrderBody = {
  phone_number: string;
  client_name?: string | null;
  items: CreateOrderItemInput[];
  notes?: string | null;
  source?: 'twilio' | 'web' | 'manual'; // pour info uniquement, pas stocké
  raw_transcript?: string | null;       // pas encore stocké en base
  scheduled_for?: string | null;        // pas encore stocké en base
};

// --- Validation simple du body ---
function validateBody(body: any): { ok: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_json' };
  }
  if (!body.phone_number || typeof body.phone_number !== 'string') {
    return { ok: false, error: 'phone_number is required' };
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { ok: false, error: 'items must be a non-empty array' };
  }
  for (const item of body.items as any[]) {
    if (
      typeof item.product_id !== 'number' ||
      !Number.isInteger(item.product_id)
    ) {
      return { ok: false, error: 'each item must have a numeric product_id' };
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return {
        ok: false,
        error: 'each item must have a positive integer quantity',
      };
    }
  }
  return { ok: true };
}

// ------------------------------------------------------
// POST /api/orders : créer une commande
// ------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: CreateOrderBody;

  try {
    body = (await req.json()) as CreateOrderBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const validation = validateBody(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'validation_error', details: validation.error },
      { status: 400 }
    );
  }

  const {
    phone_number,
    client_name,
    items,
    notes,
    // on ignore pour l’instant :
    // source,
    // raw_transcript,
    // scheduled_for,
  } = body;

  try {
    // 1) Trouver ou créer le client (clients.phone)
    const { data: existingClient, error: clientSelectError } =
      await supabaseAdmin
        .from('clients')
        .select('*')
        .eq('phone', phone_number)
        .maybeSingle();

    if (clientSelectError) {
      console.error('clientSelectError:', clientSelectError);
      return NextResponse.json(
        { error: 'database_error', details: clientSelectError.message },
        { status: 500 }
      );
    }

    let clientId = existingClient?.id as string | undefined;
    let finalClientName =
      (existingClient?.name as string | null | undefined) ??
      client_name ??
      null;

    if (!clientId) {
      const defaultName = finalClientName ?? `Client ${phone_number}`;
      const { data: insertedClient, error: clientInsertError } =
        await supabaseAdmin
          .from('clients')
          .insert({
            name: defaultName,
            phone: phone_number,
          })
          .select('id, name, phone')
          .single();

      if (clientInsertError || !insertedClient) {
        console.error('clientInsertError:', clientInsertError);
        return NextResponse.json(
          { error: 'database_error', details: clientInsertError?.message },
          { status: 500 }
        );
      }

      clientId = insertedClient.id as string;
      finalClientName =
        (insertedClient.name as string | null | undefined) ?? defaultName;
    }

    // 2) Récupérer les produits (products.id, base_price, available)
    const productIds = items.map((i) => i.product_id);

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, base_price, available')
      .in('id', productIds);

    if (productsError) {
      console.error('productsError:', productsError);
      return NextResponse.json(
        { error: 'database_error', details: productsError.message },
        { status: 500 }
      );
    }

    if (!products || products.length !== productIds.length) {
      return NextResponse.json(
        {
          error: 'invalid_product_id',
          details: 'One or more products do not exist',
        },
        { status: 400 }
      );
    }

    const productsById = new Map<number, any>(
      products.map((p) => [p.id as number, p])
    );

    // 3) Calcul du total et préparation des lignes
    let totalAmount = 0; // en euros (numeric)

    const orderItemsToInsert = items.map((item) => {
      const product = productsById.get(item.product_id);

      if (!product || product.available === false) {
        throw new Error(`product_not_available:${item.product_id}`);
      }

      const unitPrice = Number(product.base_price); // ex: 9.9
      const lineTotal = unitPrice * item.quantity;

      totalAmount += lineTotal;

      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: unitPrice,
        product_name: product.name,
      };
    });

    // 4) Création de la commande dans "orders"
    const { data: insertedOrder, error: orderInsertError } =
      await supabaseAdmin
        .from('orders')
        .insert({
          client_id: clientId,
          status: 'new',
          delivery_mode: null,        // à gérer plus tard
          delivery_address: null,     // à gérer plus tard
          note: notes ?? null,
          total: totalAmount,
          total_price: totalAmount,
        })
        .select(
          'id, client_id, status, delivery_mode, delivery_address, note, total, total_price, created_at'
        )
        .single();

    if (orderInsertError || !insertedOrder) {
      console.error('orderInsertError:', orderInsertError);
      return NextResponse.json(
        { error: 'database_error', details: orderInsertError?.message },
        { status: 500 }
      );
    }

    const orderId = insertedOrder.id as string;

    // 5) Insertion des lignes dans "order_items"
    const { data: insertedItems, error: itemsInsertError } =
      await supabaseAdmin
        .from('order_items')
        .insert(
          orderItemsToInsert.map((line) => ({
            order_id: orderId,
            product_id: line.product_id,
            qty: line.quantity,
            unit_price: line.unit_price,
          }))
        )
        .select('id, order_id, product_id, qty, unit_price');

    if (itemsInsertError) {
      console.error('itemsInsertError:', itemsInsertError);
      return NextResponse.json(
        { error: 'database_error', details: itemsInsertError.message },
        { status: 500 }
      );
    }

    // 6) Réponse finale
    return NextResponse.json(
      {
        order: {
          ...insertedOrder,
          client: {
            id: clientId,
            name: finalClientName,
            phone: phone_number,
          },
          items: insertedItems ?? [],
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('POST /api/orders exception:', err);

    if (
      typeof err.message === 'string' &&
      err.message.startsWith('product_not_available:')
    ) {
      return NextResponse.json(
        { error: 'product_not_available', details: err.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'unexpected_error' },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------
// GET /api/orders : liste des commandes pour dashboard
// ------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const status = searchParams.get('status') ?? undefined;
  const phoneNumber = searchParams.get('phone_number') ?? undefined;

  const limit = Math.min(
    Number(searchParams.get('limit') ?? '50') || 50,
    100
  );
  const offset = Number(searchParams.get('offset') ?? '0') || 0;

  try {
    let query = supabaseAdmin
      .from('orders')
      .select('id, client_id, status, delivery_mode, delivery_address, note, total, total_price, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('GET /api/orders error:', error);
      return NextResponse.json(
        { error: 'database_error', details: error.message },
        { status: 500 }
      );
    }

    const total = count ?? 0;
    const hasMore = offset + limit < total;

    return NextResponse.json({
      orders: data ?? [],
      pagination: {
        limit,
        offset,
        total,
        has_more: hasMore,
      },
    });
  } catch (err) {
    console.error('GET /api/orders exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error' },
      { status: 500 }
    );
  }
}
