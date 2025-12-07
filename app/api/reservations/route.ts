// app/api/reservations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkAdminAuth } from '@/lib/checkAdminAuth';

type CreateReservationBody = {
  client_name: string;
  phone?: string | null;
  party_size: number;
  reservation_time: string; // ISO string
  notes?: string | null;
};

const ALLOWED_RESERVATION_STATUSES = [
  'new',
  'confirmed',
  'seated',
  'cancelled',
  'no_show',
] as const;

function isValidIsoDateTime(value: string): boolean {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

// ------------------------------------------------------
// POST /api/reservations : création par bot / site
// ------------------------------------------------------
export async function POST(req: NextRequest) {
  let body: CreateReservationBody;

  try {
    body = (await req.json()) as CreateReservationBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { client_name, phone, party_size, reservation_time, notes } = body;

  if (!client_name || typeof client_name !== 'string') {
    return NextResponse.json(
      { error: 'client_name_required' },
      { status: 400 },
    );
  }

  if (
    typeof party_size !== 'number' ||
    !Number.isInteger(party_size) ||
    party_size <= 0
  ) {
    return NextResponse.json(
      { error: 'invalid_party_size' },
      { status: 400 },
    );
  }

  if (!reservation_time || !isValidIsoDateTime(reservation_time)) {
    return NextResponse.json(
      { error: 'invalid_reservation_time' },
      { status: 400 },
    );
  }

  try {
    // Optionnel : associer à un client existant par téléphone
    let clientId: string | null = null;

    if (phone) {
      const { data: existingClient, error: clientSelectError } =
        await supabaseAdmin
          .from('clients')
          .select('id')
          .eq('phone', phone)
          .maybeSingle();

      if (clientSelectError) {
        console.error(
          '[POST /api/reservations] clientSelectError:',
          clientSelectError,
        );
      } else if (existingClient?.id) {
        clientId = existingClient.id as string;
      }
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .insert({
        client_id: clientId,
        client_name,
        phone: phone ?? null,
        party_size,
        reservation_time, // ISO string → timestamptz
        notes: notes ?? null,
        status: 'new',
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[POST /api/reservations] insert error:', error);
      return NextResponse.json(
        { error: 'database_error', details: error?.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ reservation: data }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/reservations exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error', details: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}

// ------------------------------------------------------
// GET /api/reservations : vue salle (staff)
// ------------------------------------------------------
export async function GET(req: NextRequest) {
  // Protection staff (admin_key dans l’URL ou header x-admin-key)
  if (!checkAdminAuth(req.headers, req.url)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  const status = searchParams.get('status') ?? undefined;
  const day = searchParams.get('day') ?? undefined; // ex: 2025-12-07
  const limit = Math.min(
    Number(searchParams.get('limit') ?? '100') || 100,
    200,
  );

  try {
    let query = supabaseAdmin
      .from('reservations')
      .select('*', { count: 'exact' })
      .order('reservation_time', { ascending: true })
      .limit(limit);

    if (status && ALLOWED_RESERVATION_STATUSES.includes(status as any)) {
      query = query.eq('status', status);
    }

    if (day) {
      const from = new Date(`${day}T00:00:00.000Z`).toISOString();
      const to = new Date(`${day}T23:59:59.999Z`).toISOString();
      query = query
        .gte('reservation_time', from)
        .lte('reservation_time', to);
    } else {
      // Par défaut : à partir de maintenant
      const nowIso = new Date().toISOString();
      query = query.gte('reservation_time', nowIso);
    }

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/reservations error:', error);
      return NextResponse.json(
        { error: 'database_error', details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ reservations: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error('GET /api/reservations exception:', err);
    return NextResponse.json(
      { error: 'unexpected_error' },
      { status: 500 },
    );
  }
}
