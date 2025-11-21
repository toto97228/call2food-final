import { NextResponse } from "next/server";

export async function POST() {
  console.log(">>> [API] Requête POST /api/voice reçue");

  const twiml = `
<Response>
  <Say voice="alice" language="fr-FR">
    Bonjour, merci d'appeler Call2Eat !
    Que souhaitez-vous commander aujourd'hui ?
  </Say>

  <Gather input="speech" language="fr-FR" action="/api/voice/process" method="POST" timeout="5">
    <Say voice="alice" language="fr-FR">
      Je vous écoute.
    </Say>
  </Gather>

  <Say voice="alice" language="fr-FR">
    Je n'ai rien entendu. Au revoir.
  </Say>
</Response>
`;

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

export async function GET() {
  const twiml = `
<Response>
  <Say voice="alice" language="fr-FR">
    Bienvenue chez Call2Eat. 
    Cette route n'accepte que les requêtes POST.
  </Say>
</Response>
`;

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
