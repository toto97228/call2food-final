"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ReservationStatus = "new" | "confirmed" | "seated" | "cancelled" | "no_show";

type Reservation = {
  id: string;
  client_name: string | null;
  phone: string | null;
  party_size: number | null;
  reservation_time: string | null;
  status: ReservationStatus;
  notes: string | null;
  created_at: string | null;
};

type ColumnConfig = {
  key: ReservationStatus;
  title: string;
  bg: string;
};

const COLUMNS: ColumnConfig[] = [
  { key: "new", title: "Nouvelles", bg: "bg-amber-50 dark:bg-amber-950/30" },
  { key: "confirmed", title: "Confirmées", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { key: "seated", title: "En salle", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "cancelled", title: "Annulées", bg: "bg-rose-50 dark:bg-rose-950/30" },
  { key: "no_show", title: "No show", bg: "bg-slate-50 dark:bg-slate-900" },
];

function formatTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReservationsBoard() {
  const searchParams = useSearchParams();
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Récupération de l’admin_key (URL > localStorage)
  useEffect(() => {
    const keyFromUrl = searchParams.get("admin_key");
    if (keyFromUrl) {
      setAdminKey(keyFromUrl);
      localStorage.setItem("c2e_admin_key", keyFromUrl);
    } else {
      const stored = localStorage.getItem("c2e_admin_key");
      if (stored) setAdminKey(stored);
    }
  }, [searchParams]);

  const grouped = useMemo(() => {
    const map: Record<ReservationStatus, Reservation[]> = {
      new: [],
      confirmed: [],
      seated: [],
      cancelled: [],
      no_show: [],
    };
    for (const r of reservations) {
      if (!map[r.status]) continue;
      map[r.status].push(r);
    }
    return map;
  }, [reservations]);

  async function fetchReservations() {
    if (!adminKey) return;
    try {
      setLoading(true);
      setError(null);

      const url = new URL("/api/reservations", window.location.origin);
      url.searchParams.set("admin_key", adminKey);

      const res = await fetch(url.toString(), {
        method: "GET",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setReservations((data.reservations || []) as Reservation[]);
    } catch (err: any) {
      console.error("fetchReservations error:", err);
      setError(err?.message || "Erreur de chargement des réservations");
    } finally {
      setLoading(false);
    }
  }

  // première charge + rafraîchissement toutes les 15s
  useEffect(() => {
    if (!adminKey) return;
    fetchReservations();
    const id = setInterval(fetchReservations, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  async function updateStatus(id: string, status: ReservationStatus) {
    if (!adminKey) return;
    try {
      const res = await fetch("/api/reservations/status?admin_key=" + encodeURIComponent(adminKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_id: id, status }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // mise à jour locale optimiste
      setReservations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
    } catch (err: any) {
      console.error("updateStatus error:", err);
      alert("Erreur lors de la mise à jour du statut : " + (err?.message || ""));
    }
  }

  if (!adminKey) {
    return (
      <div className="rounded-2xl bg-white shadow-sm border border-orange-100 p-4 dark:bg-slate-900 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-orange-800 dark:text-slate-100 mb-2">
          Accès protégé
        </h2>
        <p className="text-xs text-orange-800/80 dark:text-slate-300">
          Ajoutez <code>?admin_key=VOTRE_CLE</code> à l’URL pour voir les réservations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-orange-800 dark:text-slate-100">
            Réservations de la salle
          </h1>
          <p className="text-xs text-orange-800/80 dark:text-slate-400">
            Vue temps réel des tables à gérer
          </p>
        </div>
        <button
          type="button"
          onClick={fetchReservations}
          className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-400"
        >
          Rafraîchir
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/60 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-xs text-orange-800/70 dark:text-slate-400">
          Chargement des réservations…
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={`flex flex-col rounded-2xl border border-orange-100/70 px-3 py-2 text-xs shadow-sm dark:border-slate-800 ${col.bg}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-orange-800 dark:text-slate-100">
                {col.title}
              </span>
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-slate-900/60 dark:text-slate-200">
                {grouped[col.key].length}
              </span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto max-h-[60vh] pr-1">
              {grouped[col.key].length === 0 && (
                <p className="text-[11px] text-orange-800/60 dark:text-slate-400">
                  Rien pour l’instant.
                </p>
              )}

              {grouped[col.key].map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl bg-white/80 px-2 py-2 shadow-sm border border-orange-100 dark:bg-slate-900/90 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-semibold text-orange-900 dark:text-slate-100">
                        {r.client_name || "Sans nom"}
                      </div>
                      <div className="text-[11px] text-orange-700/80 dark:text-slate-400">
                        {r.phone || "—"} · {r.party_size || "?"} pers · {formatTime(r.reservation_time)}
                      </div>
                    </div>
                  </div>

                  {r.notes && (
                    <div className="mt-1 text-[11px] text-orange-800/80 dark:text-slate-300">
                      {r.notes}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1">
                    {col.key !== "new" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(r.id, "new")}
                        className="rounded-full border border-orange-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-orange-700 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        Revenir en attente
                      </button>
                    )}
                    {col.key !== "confirmed" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(r.id, "confirmed")}
                        className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-600"
                      >
                        Confirmer
                      </button>
                    )}
                    {col.key !== "seated" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(r.id, "seated")}
                        className="rounded-full bg-blue-500/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-600"
                      >
                        En salle
                      </button>
                    )}
                    {col.key !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(r.id, "cancelled")}
                        className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-rose-600"
                      >
                        Annuler
                      </button>
                    )}
                    {col.key !== "no_show" && (
                      <button
                        type="button"
                        onClick={() => updateStatus(r.id, "no_show")}
                        className="rounded-full bg-slate-500/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-slate-600"
                      >
                        No show
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
