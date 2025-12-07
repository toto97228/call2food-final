// app/api/reservations/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkAdminAuth } from '@/lib/checkAdminAuth';

type Body = {
  reservation_id?: string;
  status?: string;
};

const ALLOWED_STATUSES = ['new', 'confirmed', 'seated', 'cancelled', 'no_show'];

export async function POST(request: NextRequest) {
  // Protection staff
  if (!checkAdminAuth(request.headers, request.url)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

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

    const { reservation_id, status } = body;

    if (!reservation_id || !status) {
      return NextResponse.json(
        { error: "Champs 'reservation_id' et 'status' requis." },
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
      .from('reservations')
      .update({ status })
      .eq('id', reservation_id);

    if (error) {
      console.error('[POST /api/reservations/status] Supabase error:', error);
      return NextResponse.json(
        { error: 'Erreur Supabase lors de la mise à jour du statut.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[POST /api/reservations/status] Erreur inattendue:', err);
    return NextResponse.json(
      { error: 'Erreur interne serveur.' },
      { status: 500 },
    );
  }
}
