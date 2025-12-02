// app/dashboard/page.tsx
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Petits types pour avoir de l'auto-complétion
type OrderRow = {
  id: string;
  client_id: string;
  status: string | null;
  note: string | null;
  total: number | null;
  total_price: number | null;
  created_at: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  phone: string | null;
};

// Fonction utilitaire pour formater la date
function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Cette page est un composant "server" (pas de "use client")
export default async function DashboardPage() {
  // 1) Récupérer les commandes (les plus récentes d'abord)
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, client_id, status, note, total, total_price, created_at')
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('Dashboard ordersError:', ordersError);
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Erreur chargement commandes</h1>
          <p className="text-red-400">
            {ordersError.message}
          </p>
        </div>
      </main>
    );
  }

  const safeOrders: OrderRow[] = (orders ?? []) as OrderRow[];

  // 2) Récupérer les clients correspondants
  const clientIds = Array.from(new Set(safeOrders.map((o) => o.client_id))).filter(
    Boolean
  );

  let clientsById = new Map<string, ClientRow>();

  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone')
      .in('id', clientIds);

    if (clientsError) {
      console.warn('Dashboard clientsError (non-bloquant):', clientsError);
    } else if (clients) {
      clientsById = new Map(
        (clients as ClientRow[]).map((c) => [c.id, c])
      );
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Bandeau haut */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-orange-500 to-pink-500 flex items-center justify-center text-xs font-bold">
              C2
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Call2Eat – Dashboard
              </div>
              <div className="text-xs text-slate-400">
                Vue en temps réel des commandes
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Connecté à Supabase</span>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Résumé rapide */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
              Commandes totales
            </div>
            <div className="text-2xl font-bold">
              {safeOrders.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
              Dernière commande
            </div>
            <div className="text-sm">
              {safeOrders[0]
                ? formatDate(safeOrders[0].created_at)
                : '-'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
              Montant de la dernière commande
            </div>
            <div className="text-lg font-semibold">
              {safeOrders[0]?.total != null
                ? `${safeOrders[0].total.toFixed(2)} €`
                : '-'}
            </div>
          </div>
        </section>

        {/* Tableau des commandes */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">
              Commandes récentes
            </h2>
            <span className="text-xs text-slate-400">
              {safeOrders.length} enregistrements
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">
                    Client
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">
                    Téléphone
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">
                    Statut
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400">
                    Total
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {safeOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-slate-400 text-sm"
                    >
                      Aucune commande pour l’instant.
                    </td>
                  </tr>
                )}

                {safeOrders.map((order) => {
                  const client = clientsById.get(order.client_id);
                  const status = order.status ?? '—';

                  return (
                    <tr
                      key={order.id}
                      className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {client?.name ?? 'Client inconnu'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-300">
                        {client?.phone ?? '—'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-xs">
                          <span
                            className={`mr-1 h-1.5 w-1.5 rounded-full ${
                              status === 'new'
                                ? 'bg-amber-400'
                                : status === 'confirmed'
                                ? 'bg-emerald-400'
                                : 'bg-slate-500'
                            }`}
                          />
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right font-medium">
                        {order.total != null
                          ? `${order.total.toFixed(2)} €`
                          : '—'}
                      </td>
                      <td className="px-4 py-2 max-w-xs truncate text-slate-300">
                        {order.note ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
