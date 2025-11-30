import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://call2food-gateway.up.railway.app" />
  </Connect>
</Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}
