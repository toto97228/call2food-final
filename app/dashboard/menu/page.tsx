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

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState<string>("");
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);

  const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY_PLACEHOLDER ?? "";

  // Charger les produits
  async function loadProducts() {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts((data && data.products) ?? []);
    } catch (err) {
      console.error("Erreur chargement produits:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  // Sauvegarder une modification d'un produit existant
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
        const data = await res.json().catch(() => null);
        console.error("PATCH /api/products error:", data);
        alert("Erreur lors de la sauvegarde du produit.");
        return;
      }

      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...update } : p))
      );
    } catch (err) {
      console.error("updateProduct exception:", err);
      alert("Erreur lors de la sauvegarde du produit.");
    } finally {
      setSaving(null);
    }
  }

  // Créer un nouveau produit
  async function handleCreateProduct() {
    const name = newName.trim();
    const priceStr = newPrice.trim();
    const stockNote = newNote.trim() || null;

    // convertir "11,9" → 11.9
    const normalized = priceStr.replace(",", ".");
    const priceNumber = Number(normalized);

    if (!name || Number.isNaN(priceNumber)) {
      alert("Nom ou prix invalide.");
      return;
    }

    setCreating(true);
    try {
      const resp = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({
          name,
          base_price: priceNumber, // IMPORTANT: colonne en base
          stock_note: stockNote,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        console.error("Create product error:", data);
        alert("Erreur lors de la création du produit.");
        return;
      }

      // reset formulaire + rechargement liste
      setNewName("");
      setNewPrice("");
      setNewNote("");
      await loadProducts();
    } catch (err) {
      console.error("handleCreateProduct exception:", err);
      alert("Erreur lors de la création du produit.");
    } finally {
      setCreating(false);
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
              Activez, désactivez et ajoutez des plats en temps réel
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* CONTENU */}
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        {/* Formulaire nouveau produit */}
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">Ajouter un nouveau produit</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs block mb-1">Nom du produit</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-orange-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                placeholder="Ex : Pizza Reine"
              />
            </div>
            <div>
              <label className="text-xs block mb-1">Prix (€)</label>
              <input
                type="number"
                step="0.1"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-orange-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                placeholder="Ex : 12.5"
              />
            </div>
            <div>
              <label className="text-xs block mb-1">Note stock (optionnel)</label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-orange-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                placeholder="Rupture saumon, etc."
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateProduct}
            disabled={creating}
            className="mt-2 inline-flex items-center justify-center rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-orange-600 disabled:opacity-60"
          >
            {creating ? "Création..." : "Ajouter le produit"}
          </button>
        </section>

        {/* Liste des produits existants */}
        <section className="space-y-4">
          {loading && <p>Chargement…</p>}

          {!loading && products.length === 0 && <p>Aucun produit trouvé.</p>}

          {!loading &&
            products.length > 0 &&
            products.map((product) => (
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
        </section>
      </div>
    </main>
  );
}
