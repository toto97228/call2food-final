// app/api/db-check/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET() {
  try {
    const { error } = await supabaseAdmin
      .from('products')
      .select('id')
      .limit(1);

    if (error) {
      console.error('DB check error:', error);
      return NextResponse.json(
        { status: 'error', error: 'database_unreachable' },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('DB check exception:', err);
    return NextResponse.json(
      { status: 'error', error: 'unexpected_error' },
      { status: 500 }
    );
  }
}
