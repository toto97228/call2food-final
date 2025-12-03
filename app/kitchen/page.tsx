import { supabaseAdmin } from '@/lib/supabaseAdmin';

type OrderRow = {
  id: string;
  client_id: string;
  status: string | null;
  note: string | null;
  created_at: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  phone: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: number;
  qty: number;
  unit_price: number;
};

type ProductRow = {
  id: number;
  name: string | null;
};

function formatTime(dateString: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function KitchenPage() {
  // 1) Récupérer les commandes (les plus récentes d'abord)
  const { data: ordersData, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, client_id, status, note, created_at')
    .order('created_at', { ascending: false });

  if (ordersError) {
    console.error('Kitchen ordersError:', ordersError);
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Erreur de chargement (cuisine)</h1>
          <p className="text-red-400 text-sm">{ordersError.message}</p>
        </div>
      </main>
    );
  }

  const orders: OrderRow[] = (ordersData ?? []) as OrderRow[];

  if (orders.length === 0) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="border-b border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 flex items-center justify-center rounded-full bg-orange-500 text-white font-bold text-sm">
              C2
            </div>
            <div>
              <div className="text-sm font-semibold">Vue Cuisine – Call2Eat</div>
              <div className="text-xs text-slate-400">Aucune commande pour l’instant</div>
            </div>
          </div>
          <a
            href="/dashboard"
            className="text-xs rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:bg-slate-800"
          >
            ← Retour dashboard
          </a>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-sm">En attente de commandes…</p>
        </div>
      </main>
    );
  }

  // 2) Clients
  const clientIds = Array.from(new Set(orders.map((o) => o.client_id))).filter(
    Boolean
  );

  let clientsById = new Map<string, ClientRow>();
  if (clientIds.length > 0) {
    const { data: clientsData } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone')
      .in('id', clientIds);

    if (clientsData) {
      clientsById = new Map(
        (clientsData as ClientRow[]).map((c) => [c.id, c])
      );
    }
  }

  // 3) Order items
  const orderIds = orders.map((o) => o.id);
  const { data: itemsData, error: itemsError } = await supabaseAdmin
    .from('order_items')
    .select('id, order_id, product_id, qty, unit_price')
    .in('order_id', orderIds);

  if (itemsError) {
    console.error('Kitchen itemsError:', itemsError);
  }

  const items: OrderItemRow[] = (itemsData ?? []) as OrderItemRow[];

  // 4) Produits
  const productIds = Array.from(new Set(items.map((i) => i.product_id)));
  let productsById = new Map<number, ProductRow>();

  if (productIds.length > 0) {
    const { data: productsData, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .in('id', productIds);

    if (productsError) {
      console.error('Kitchen productsError:', productsError);
    } else if (productsData) {
      productsById = new Map(
        (productsData as ProductRow[]).map((p) => [p.id, p])
      );
    }
  }

  // 5) Regrouper les items par commande
  const itemsByOrderId = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const list = itemsByOrderId.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrderId.set(item.order_id, list);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Barre haute */}
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 flex items-center justify-center rounded-full bg-orange-500 text-white font-bold text-sm">
            C2
          </div>
          <div>
            <div className="text-sm font-semibold">Vue Cuisine – Call2Eat</div>
            <div className="text-xs text-slate-400">
              Commandes à préparer (ordre anti-chronologique)
            </div>
          </div>
        </div>
        <a
          href="/dashboard"
          className="text-xs rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:bg-slate-800"
        >
          ← Retour dashboard
        </a>
      </header>

      {/* Liste des commandes */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4">
          {orders.map((order) => {
            const client = clientsById.get(order.client_id);
            const orderItems = itemsByOrderId.get(order.id) ?? [];

            return (
              <div
                key={order.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-lg"
              >
                {/* En-tête commande */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Commande
                    </div>
                    <div className="text-lg font-semibold">
                      {client?.name ?? 'Client inconnu'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">
                      {formatTime(order.created_at)}
                    </div>
                    <div className="text-xs text-slate-300">
                      {client?.phone ?? '—'}
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="mt-3 space-y-1">
                  {orderItems.length === 0 && (
                    <p className="text-sm text-slate-400">
                      Aucun détail d&apos;articles.
                    </p>
                  )}

                  {orderItems.map((item) => {
                    const product = productsById.get(item.product_id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="font-semibold">
                          {item.qty} × {product?.name ?? `Produit #${item.product_id}`}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {item.unit_price.toFixed(2)} €
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Note */}
                {order.note && (
                  <div className="mt-3 rounded-xl bg-slate-800 px-3 py-2 text-xs text-amber-200 border border-amber-400/40">
                    <span className="font-semibold">Note cuisine :</span>{' '}
                    {order.note}
                  </div>
                )}

                {/* Statut */}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-1">
                    <span
                      className={`mr-1 h-1.5 w-1.5 rounded-full ${
                        order.status === 'new'
                          ? 'bg-amber-400'
                          : order.status === 'confirmed'
                          ? 'bg-emerald-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    {order.status ?? '—'}
                  </span>
                  <span className="text-slate-400">
                    ID courte : {order.id.slice(0, 8)}…
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
