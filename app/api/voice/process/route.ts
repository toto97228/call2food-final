import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseOrderWithAI } from "@/lib/aiOrderParser";

export async function POST(req: Request) {
  const formData = await req.formData();

  const speechResult = (formData.get("SpeechResult") ?? "") as string;
  const fromNumber = (formData.get("From") ?? "") as string;

  console.log("Texte brut Twilio :", speechResult);
  console.log("Numéro appelant :", fromNumber);

  // 1) Appel IA pour interpréter la commande
  const aiOrder = await parseOrderWithAI(speechResult);

  let productName: string | null = null;
  let quantity: number | null = null;

  if (aiOrder && aiOrder.items.length > 0) {
    // Pour l’instant on ne stocke que le premier produit dans voice_orders
    productName = aiOrder.items[0].product;
    quantity = aiOrder.items[0].quantity;
  }

  console.log("Commande interprétée par l'IA :", aiOrder);

  // 2) Enregistrement dans Supabase (table voice_orders)
  const { error } = await supabaseAdmin.from("voice_orders").insert({
    from_number: fromNumber,
    speech_result: speechResult,
    product_name: productName,
    quantity: quantity,
  });

  if (error) {
    console.error("Erreur d'insertion Supabase :", error);
    return NextResponse.json(
      { success: false, error: "Erreur Supabase" },
      { status: 500 }
    );
  }

}
  // 3) Réponse TwiML dynamique
  let humanSummary = "Merci, votre commande a été prise en compte.";

  if (aiOrder && aiOrder.items.length > 0) {
    const parts = aiOrder.items.map((item) => {
      const qty = item.quantity ?? 1;
      const plural = qty > 1 ? "s" : "";
      return `${qty} ${item.product}${plural}`;
    });

    humanSummary = `Merci. J'ai bien noté ${parts.join(" et ")}.`;
  } else {
    humanSummary =
      "Merci. Votre commande a été enregistrée, mais je n'ai pas bien compris les détails.";
  }

  const twiml = `
<Response>
  <Say voice="alice" language="fr-FR">
    ${humanSummary}
  </Say>
</Response>
`.trim();

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}
