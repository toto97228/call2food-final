import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/checkAdminAuth';
import { createOrderFromNames } from '@/lib/createOrderFromNames';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // 1) Format simple (debug/tests manuels)
  if (body?.customer_phone && Array.isArray(body?.items)) {
    const result = await createOrderFromNames({
      phone: body.customer_phone,
      items: body.items,
      notes: body.notes,
      callId: body.call_id ?? 'direct_test',
    });

    return NextResponse.json({ results: [{ toolCallId: 'direct', result }] });
  }

  // 2) Format Vapi tool
  const toolCalls = body?.message?.toolCallList;
  if (!Array.isArray(toolCalls)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const results = [];

  for (const call of toolCalls) {
    try {
      const { customer_phone, items, notes, call_id } = call.arguments ?? {};

      const result = await createOrderFromNames({
        phone: customer_phone,
        items,
        notes,
        callId: call_id ?? call.id,
      });

      results.push({ toolCallId: call.id, result });
    } catch (e: any) {
      results.push({
        toolCallId: call?.id ?? 'unknown',
        result: { ok: false, error: e?.message ?? 'unknown_error' },
      });
    }
  }

  return NextResponse.json({ results });
}
