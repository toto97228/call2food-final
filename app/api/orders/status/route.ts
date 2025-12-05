// app/api/orders/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type Body = {
  order_id?: string;
  status?: string;
};

const ALLOWED_STATUSES = ['new', 'in_progress', 'done', 'confirmed'];

export async function POST(request: NextRequest) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json(
        { error: 'Corps JSON invalide.' },
        { status: 400 },
      );
    }

    const { order_id, status } = body;

    if (!order_id || !status) {
      return NextResponse.json(
        { error: "Champs 'order_id' et 'status' requis." },
        { status: 400 },
      );
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          error: `Status invalide. Valeurs acceptées : ${ALLOWED_STATUSES.join(
            ', ',
          )}`,
        },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', order_id);

    if (error) {
      console.error('[POST /api/orders/status] Supabase error:', error);
      return NextResponse.json(
        { error: 'Erreur Supabase lors de la mise à jour du statut.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/orders/status] Erreur inattendue:', err);
    return NextResponse.json(
      { error: 'Erreur interne serveur.' },
      { status: 500 },
    );
  }
}
