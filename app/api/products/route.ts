// app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/products
export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*') // on prend toutes les colonnes existantes
      .order('id', { ascending: true });

    if (error) {
      console.error('GET /api/products error:', error);
      return NextResponse.json(
        { error: 'database_error', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ products: data ?? [] });
  } catch (err) {
    console.error('GET /api/products exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error' },
      { status: 500 }
    );
  }
}
