"use client";

import { useEffect, useState } from "react";
import ThemeToggle from "../ThemeToggle";

type Product = {
  id: number;
  name: string;
  base_price: number;
  available: boolean;
  stock_note?: string | null;
};

export default function MenuDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY_PLACEHOLDER ?? "";

  // Charger les produits
  async function loadProducts() {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    setProducts(data.products ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  // Sauvegarder une modification
  async function updateProduct(id: number, update: Partial<Product>) {
    setSaving(id);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify(update),
      });

      if (!res.ok) {
        alert("Erreur API");
        return;
      }

      // Mettre à jour l'état local
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...update } : p))
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF3E2] text-slate-800 dark:bg-slate-950 dark:text-slate-100">

      {/* HEADER */}
      <header className="border-b border-orange-200/50 bg-[#FFE4C2]/80 backdrop-blur dark:bg-slate-900 dark:border-slate-800">
        <div className="mx-auto max-w-5xl px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold">Gestion de la carte</h1>
            <p className="text-xs text-orange-800/80">
              Activez ou désactivez les plats en temps réel
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* CONTENU */}
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-4">

        {loading && <p>Chargement…</p>}

        {!loading && products.length === 0 && (
          <p>Aucun produit trouvé.</p>
        )}

        {!loading && products.length > 0 && (
          <div className="space-y-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-800 p-4 shadow-sm"
              >
                {/* Nom + switch dispo */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{product.name}</div>
                    <div className="text-xs text-orange-700/70">
                      ID : {product.id}
                    </div>
                  </div>

                  {/* Dispo switch */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs">
                      {product.available ? "Disponible" : "Indisponible"}
                    </span>
                    <input
                      type="checkbox"
                      checked={product.available}
                      onChange={(e) =>
                        updateProduct(product.id, {
                          available: e.target.checked,
                        })
                      }
                      className="h-5 w-5"
                    />
                  </label>
                </div>

                {/* Prix */}
                <div className="mt-3">
                  <label className="text-xs block mb-1">Prix (€)</label>
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={product.base_price}
                    onBlur={(e) =>
                      updateProduct(product.id, {
                        base_price: parseFloat(e.target.value),
                      })
                    }
                    className="w-32 px-2 py-1 rounded-lg border border-orange-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                {/* Note stock */}
                <div className="mt-3">
                  <label className="text-xs block mb-1">Note de stock</label>
                  <textarea
                    defaultValue={product.stock_note ?? ""}
                    placeholder="Ex : rupture mozzarella, plus de coca zéro…"
                    onBlur={(e) =>
                      updateProduct(product.id, {
                        stock_note: e.target.value,
                      })
                    }
                    className="w-full px-2 py-1 rounded-lg border border-orange-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  />
                </div>

                {saving === product.id && (
                  <p className="text-xs text-orange-600 mt-2">
                    Sauvegarde en cours…
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
