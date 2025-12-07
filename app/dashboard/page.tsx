import { supabaseAdmin } from '@/lib/supabaseAdmin';
import ThemeToggle from './ThemeToggle';
import Link from 'next/link';

type OrderRow = {
  id: string;
  client_id: string;
  status: string | null;
  note: string | null;
  total: number | null;
  created_at: string | null;
  delivery_address?: string | null;
  needs_human: boolean | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  phone: string | null;
  address?: string | null;
};

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string | null): string {
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

function isSameDay(dateString: string | null, ref: Date): boolean {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export default async function DashboardPage() {
  const { data: ordersData, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select(
      'id, client_id, status, note, total, created_at, delivery_address, needs_human',
    )
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('Dashboard ordersError:', ordersError);
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#FFF3E2] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            Erreur de chargement des commandes
          </h1>
          <p className="text-red-500 text-sm">{ordersError.message}</p>
        </div>
      </main>
    );
  }

  const orders: OrderRow[] = (ordersData ?? []) as OrderRow[];

  const clientIds = Array.from(new Set(orders.map((o) => o.client_id))).filter(
    Boolean,
  );

  let clientsById = new Map<string, ClientRow>();

  if (clientIds.length > 0) {
    const { data: clientsData, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone, address')
      .in('id', clientIds);

    if (clientsError) {
      console.warn('Dashboard clientsError (non-bloquant):', clientsError);
    } else if (clientsData) {
      const rows = clientsData as ClientRow[];
      clientsById = new Map(rows.map((c) => [c.id, c]));
    }
  }

  const now = new Date();
  const ordersToday = orders.filter((o) => isSameDay(o.created_at, now));
  const commandesDuJour = ordersToday.length;
  const revenuDuJour = ordersToday.reduce((sum, o) => sum + (o.total ?? 0), 0);

  const totalCommandes = orders.length;
  const derniereCommande = orders[0] ?? null;

  const appelsRecus: string | null = null;
  const tauxConversion: string | null = null;

  const lastOrderByClient = new Map<
    string,
    { client: ClientRow; lastDate: string }
  >();

  for (const order of orders) {
    if (!order.client_id) continue;
    const client = clientsById.get(order.client_id);
    if (!client) continue;
    const prev = lastOrderByClient.get(order.client_id);
    if (!prev) {
      lastOrderByClient.set(order.client_id, {
        client,
        lastDate: order.created_at ?? '',
      });
    } else if (
      order.created_at &&
      new Date(order.created_at) > new Date(prev.lastDate)
    ) {
      lastOrderByClient.set(order.client_id, {
        client,
        lastDate: order.created_at,
      });
    }
  }

  const clientsSummary = Array.from(lastOrderByClient.values()).slice(0, 5);

  return (
    <main className="min-h-screen bg-[#FFF3E2] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Barre supérieure */}
      <header className="border-b border-orange-100/70 bg-[#FFE4C2]/90 backdrop-blur dark:bg-slate-900 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-400 shadow-sm text-white text-sm font-bold">
              C2
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Call2Eat – Dashboard
              </div>
              <div className="text-xs text-orange-700/80 dark:text-slate-400">
                Vue en temps réel des commandes
              </div>
              {/* Navigation Dashboard / Cuisine / Salle */}
              <nav className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <Link
                  href="/dashboard"
                  className="rounded-full bg-white/80 px-3 py-1 font-medium text-orange-800 shadow-sm border border-orange-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                >
                  Dashboard
                </Link>
                <Link
                  href="/kitchen"
                  className="rounded-full bg-transparent px-3 py-1 font-medium text-orange-800/70 border border-transparent hover:border-orange-200 dark:text-slate-300 dark:hover:border-slate-700"
                >
                  Vue cuisine
                </Link>
                <Link
                  href={`/room?admin_key=${process.env.NEXT_PUBLIC_ADMIN_KEY_PLACEHOLDER ?? ''}`}
                  className="rounded-full bg-transparent px-3 py-1 font-medium text-orange-800/70 border border-transparent hover:border-orange-200 dark:text-slate-300 dark:hover:border-slate-700"
                >
                  Vue salle (réservations)
                </Link>
              </nav>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <div className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 shadow-sm border border-orange-100 dark:bg-slate-800 dark:border-slate-700">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                Connecté à Supabase
              </span>
            </div>

            {/* Toggle clair / nuit */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Contenu */}
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Statistiques hautes */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white shadow-sm border border-orange-100 px-4 py-3 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs font-medium text-orange-700/80 dark:text-slate-300">
              Commandes du jour
            </div>
            <div className="mt-2 text-2xl font-bold text-orange-600 dark:text-orange-300">
              {commandesDuJour}
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-orange-100 px-4 py-3 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs font-medium text-orange-700/80 dark:text-slate-300">
              Revenu du jour
            </div>
            <div className="mt-2 text-2xl font-bold">
              {revenuDuJour.toFixed(2)} €
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-orange-100 px-4 py-3 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs font-medium text-orange-700/80 dark:text-slate-300">
              Appels reçus
            </div>
            <div className="mt-2 text-2xl font-bold">
              {appelsRecus !== null ? appelsRecus : '—'}
            </div>
            <p className="mt-1 text-[11px] text-orange-700/70 dark:text-slate-400">
              Non disponible pour l’instant (stat issu de Twilio à brancher plus
              tard).
            </p>
          </div>

          <div className="rounded-2xl bg-white shadow-sm border border-orange-100 px-4 py-3 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs font-medium text-orange-700/80 dark:text-slate-300">
              Taux de conversion
            </div>
            <div className="mt-2 text-2xl font-bold">
              {tauxConversion !== null ? `${tauxConversion} %` : '—'}
            </div>
            <p className="mt-1 text-[11px] text-orange-700/70 dark:text-slate-400">
              Nécessite les visites du site / appels total → à calculer plus
              tard.
            </p>
          </div>
        </section>

        {/* Bloc central : courbe + nouvelle commande */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Courbe placeholder */}
          <div className="lg:col-span-2 rounded-2xl bg-white shadow-sm border border-orange-100 p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-orange-800 dark:text-slate-100">
                Commandes (vue hebdo)
              </h2>
              <span className="text-[11px] text-orange-700/70 dark:text-slate-400">
                Illustration – courbe à brancher plus tard
              </span>
            </div>

            <div className="mt-2 h-32 rounded-xl bg-gradient-to-t from-orange-100 to-orange-50 flex items-end justify-between px-4 pb-2 dark:from-slate-800 dark:to-slate-900">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(
                (day, idx) => (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <div
                      className="w-2 rounded-full bg-orange-400/80 dark:bg-orange-300/80"
                      style={{
                        height: `${40 + idx * 6}px`,
                      }}
                    />
                    <span className="text-[11px] text-orange-800/70 dark:text-slate-300">
                      {day}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Nouvelle commande */}
          <div className="rounded-2xl bg-white shadow-sm border border-orange-100 p-4 flex flex-col gap-3 dark:bg-slate-900 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-orange-800 dark:text-slate-100">
              Nouvelle commande
            </h2>

            {derniereCommande ? (
              <>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-orange-700 font-semibold dark:bg-orange-900/50 dark:text-orange-200">
                    {(() => {
                      const client = clientsById.get(derniereCommande.client_id);
                      const label = client?.name ?? 'Client';
                      return label.charAt(0).toUpperCase();
                    })()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">
                        {clientsById.get(derniereCommande.client_id)?.name ??
                          'Client inconnu'}
                      </div>
                      {derniereCommande.needs_human && (
                        <span className="inline-flex items-center rounded-full bg-rose-600/15 text-rose-700 border border-rose-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-rose-500/20 dark:text-rose-100 dark:border-rose-400">
                          👤 Besoin humain
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-orange-700/80 dark:text-slate-400">
                      {formatDateTime(derniereCommande.created_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-xs space-y-1">
                  <p className="text-orange-800/80 dark:text-slate-200">
                    Total :{' '}
                    <span className="font-semibold">
                      {derniereCommande.total?.toFixed(2) ?? '0.00'} €
                    </span>
                  </p>
                  {derniereCommande.note && (
                    <p className="text-orange-800/80 dark:text-slate-300">
                      Note : <span>{derniereCommande.note}</span>
                    </p>
                  )}
                  <p className="text-orange-800/80 dark:text-slate-300">
                    Adresse :{' '}
                    <span>
                      {derniereCommande.delivery_address ??
                        clientsById.get(derniereCommande.client_id)?.address ??
                        'Non renseignée'}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-orange-600 transition-colors dark:bg-orange-500 dark:hover:bg-orange-400"
                >
                  Voir les commandes
                </button>
              </>
            ) : (
              <p className="text-sm text-orange-800/80 dark:text-slate-300">
                Aucune commande enregistrée pour l’instant.
              </p>
            )}
          </div>
        </section>

        {/* Bas : tableau commandes + clients + paramètres */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Commandes */}
          <div className="lg:col-span-2 rounded-2xl bg-white shadow-sm border border-orange-100 p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-orange-800 dark:text-slate-100">
                Commandes
              </h2>
              <span className="text-[11px] text-orange-700/70 dark:text-slate-400">
                {totalCommandes} enregistrements
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left border-b border-orange-100 dark:border-slate-800">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Client</th>
                    <th className="py-2 pr-3">Téléphone</th>
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-4 text-center text-orange-700/70 dark:text-slate-400"
                      >
                        Aucune commande enregistrée.
                      </td>
                    </tr>
                  )}

                  {orders.map((order) => {
                    const client = clientsById.get(order.client_id);
                    const status = order.status ?? '—';

                    return (
                      <tr
                        key={order.id}
                        className="border-b border-orange-50/80 last:border-0 dark:border-slate-800"
                      >
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatDateTime(order.created_at)}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>{client?.name ?? 'Client inconnu'}</span>
                            {order.needs_human && (
                              <span className="inline-flex items-center rounded-full bg-rose-600/15 text-rose-700 border border-rose-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide dark:bg-rose-500/20 dark:text-rose-100 dark:border-rose-400">
                                👤 Besoin humain
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {client?.phone ?? '—'}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 border border-orange-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                            <span
                              className={`mr-1 h-1.5 w-1.5 rounded-full ${
                                status === 'new'
                                  ? 'bg-amber-400'
                                  : status === 'confirmed'
                                  ? 'bg-emerald-400'
                                  : 'bg-slate-400'
                              }`}
                            />
                            {status}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap font-semibold">
                          {order.total != null
                            ? `${order.total.toFixed(2)} €`
                            : '—'}
                        </td>
                        <td className="py-2 pr-3 max-w-xs truncate">
                          {order.note ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Clients + paramètres bot */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white shadow-sm border border-orange-100 p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-orange-800 dark:text-slate-100">
                  Clients
                </h2>
              </div>
              <div className="space-y-2 text-xs">
                {clientsSummary.length === 0 && (
                  <p className="text-orange-700/70 dark:text-slate-400">
                    Aucun client pour l’instant.
                  </p>
                )}

                {clientsSummary.map(({ client, lastDate }) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between border-b border-orange-50 pb-2 last:border-0 last:pb-0 dark:border-slate-800"
                  >
                    <div>
                      <div className="font-medium">
                        {client.name ?? 'Client sans nom'}
                      </div>
                      <div className="text-[11px] text-orange-700/70 dark:text-slate-400">
                        Dernière commande : {formatDate(lastDate)}
                      </div>
                    </div>
                    <div className="text-[11px] text-orange-700/80 dark:text-slate-300">
                      {client.phone ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-sm border border-orange-100 p-4 dark:bg-slate-900 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-orange-800 mb-2 dark:text-slate-100">
                Paramètres Bot
              </h2>
              <div className="space-y-2 text-xs text-orange-800/80 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <span>Voix</span>
                  <span className="font-medium">Charlotte (fr-FR)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Horaires bot</span>
                  <span className="font-medium">11h00 – 23h00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Source commandes</span>
                  <span className="font-medium">Twilio + Web</span>
                </div>
                <p className="pt-1 text-[11px] text-orange-700/70 dark:text-slate-400">
                  Ces paramètres seront pilotés plus tard via une vraie page de
                  configuration.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
