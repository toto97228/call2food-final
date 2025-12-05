// app/kitchen/page.tsx
import KitchenBoard from './KitchenBoard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type OrderRow = {
  id: string;
  client_id: string;
  status: string | null;
  note: string | null;
  created_at: string | null;
  needs_human: boolean | null;
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

export type KitchenOrderItem = {
  id: string;
  product_id: number;
  qty: number;
  unit_price: number;
  product_name: string | null;
};

export type KitchenOrder = {
  id: string;
  status: string | null;
  note: string | null;
  created_at: string | null;
  client_name: string | null;
  client_phone: string | null;
  needs_human: boolean; // <- important pour le badge
  items: KitchenOrderItem[];
};

export default async function KitchenPage() {
  // 1) Récupérer les commandes (les plus récentes d'abord)
  const { data: ordersData, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, client_id, status, note, created_at, needs_human')
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
  const clientIds = Array.from(new Set(orders.map((o) => o.client_id))).filter(Boolean);

  let clientsById = new Map<string, ClientRow>();
  if (clientIds.length > 0) {
    const { data: clientsData } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone')
      .in('id', clientIds);

    if (clientsData) {
      clientsById = new Map((clientsData as ClientRow[]).map((c) => [c.id, c]));
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
      productsById = new Map((productsData as ProductRow[]).map((p) => [p.id, p]));
    }
  }

  // 5) Construire la structure simple pour le composant client
  const kitchenOrders: KitchenOrder[] = orders.map((order) => {
    const client = clientsById.get(order.client_id);
    const orderItems = items.filter((i) => i.order_id === order.id);

    const mappedItems: KitchenOrderItem[] = orderItems.map((item) => {
      const product = productsById.get(item.product_id);
      return {
        id: item.id,
        product_id: item.product_id,
        qty: item.qty,
        unit_price: item.unit_price,
        product_name: product?.name ?? null,
      };
    });

    return {
      id: order.id,
      status: order.status,
      note: order.note,
      created_at: order.created_at,
      client_name: client?.name ?? null,
      client_phone: client?.phone ?? null,
      needs_human: order.needs_human ?? false,
      items: mappedItems,
    };
  });

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
              Commandes à préparer (ordre anti-chronologique – réorganisation locale possible)
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

      {/* Liste des commandes en composant client */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          <KitchenBoard initialOrders={kitchenOrders} />
        </div>
      </div>
    </main>
  );
}
