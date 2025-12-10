// app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkAdminAuth } from '@/lib/checkAdminAuth';

// GET /api/products -> liste complète
export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('GET /api/products error:', error);
      return NextResponse.json(
        { error: 'database_error', details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ products: data ?? [] });
  } catch (err) {
    console.error('GET /api/products exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error' },
      { status: 500 },
    );
  }
}

// POST /api/products -> création d’un produit
export async function POST(req: NextRequest) {
  // protection admin
  const auth = checkAdminAuth(req);
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    const { name, price, stock_note } = body as {
      name?: string;
      price?: number;
      stock_note?: string | null;
    };

    if (!name || typeof price !== 'number' || Number.isNaN(price)) {
      return NextResponse.json(
        { error: 'invalid_payload' },
        { status: 400 },
      );
    }

    // catégorie par défaut (contrainte NOT NULL dans Supabase)
    const defaultCategory = 'pizza';

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([
        {
          name,
          base_price: price,
          stock_note: stock_note ?? null,
          available: true,
          category: defaultCategory,
        },
      ])
      .select('*')
      .single();

    if (error) {
      console.error('POST /api/products error:', error);
      return NextResponse.json(
        { error: 'database_error', details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ product: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/products exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error' },
      { status: 500 },
    );
  }
}
