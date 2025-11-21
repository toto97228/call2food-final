// app/dashboard/page.tsx
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic"; // pour toujours avoir les dernières données

type VoiceOrder = {
  id: string;
  from_number: string | null;
  speech_result: string | null;
  product_name: string | null;
  quantity: number | null;
  created_at: string;
};

export default async function DashboardPage() {
  const { data, error } = await supabaseAdmin
    .from("voice_orders")
    .select("id, from_number, speech_result, product_name, quantity, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Erreur Supabase dashboard :", error);
  }

  const orders: VoiceOrder[] = (data ?? []) as VoiceOrder[];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">📊 Call2Eat – Dashboard</h1>
            <p className="text-sm text-zinc-400">
              Dernières commandes vocales reçues depuis Twilio (table
              <span className="font-mono"> voice_orders</span>).
            </p>
          </div>

          <a
            href="/"
            className="rounded-full border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
          >
            ⬅ Retour
          </a>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium">Commandes vocales</h2>
            <span className="text-xs text-zinc-400">
              {orders.length} enregistrements
            </span>
          </div>

          {orders.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Aucune commande pour l&apos;instant. Passe un appel sur ton numéro
              Twilio pour tester.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-400">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Téléphone</th>
                    <th className="px-3 py-2">Texte reconnu</th>
                    <th className="px-3 py-2">Produit</th>
                    <th className="px-3 py-2">Qté</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-zinc-900/60 hover:bg-zinc-800/40"
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-400">
                        {new Date(order.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs font-mono text-zinc-300">
                        {order.from_number ?? "?"}
                      </td>
                      <td className="max-w-xs px-3 py-2 text-sm">
                        {order.speech_result}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm">
                        {order.product_name ?? "Non détecté"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-center">
                        {order.quantity ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
