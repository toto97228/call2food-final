// app/room/ReservationsBoard.tsx
'use client';

import { useEffect, useState } from 'react';

type ReservationStatus = 'new' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';

type Reservation = {
  id: string;
  client_name: string;
  phone: string | null;
  party_size: number;
  reservation_time: string; // ISO
  status: ReservationStatus;
  notes: string | null;
};

type Props = {
  adminKey: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  new: 'Nouvelles',
  confirmed: 'Confirmées',
  seated: 'En salle',
  cancelled: 'Annulées',
  no_show: 'No show',
};

const STATUS_ORDER: ReservationStatus[] = [
  'new',
  'confirmed',
  'seated',
  'cancelled',
  'no_show',
];

export function ReservationsBoard({ adminKey }: Props) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReservations() {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reservations?admin_key=${encodeURIComponent(adminKey)}`,
        { cache: 'no-store' },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Erreur lors du chargement');
      }
      setReservations(json.reservations || []);
    } catch (e: any) {
      console.error('loadReservations error:', e);
      setError(e?.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReservations();
    const id = setInterval(loadReservations, 15_000); // refresh auto
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  async function updateStatus(id: string, status: ReservationStatus) {
    try {
      const res = await fetch(
        `/api/reservations/status?admin_key=${encodeURIComponent(adminKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservation_id: id, status }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.error || 'Erreur mise à jour statut');
      }
      setReservations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );
    } catch (e) {
      console.error('updateStatus error:', e);
      // Optionnel: toast / message
    }
  }

  if (!adminKey) {
    return (
      <div className="p-4 text-red-600">
        Paramètre <code>admin_key</code> manquant dans l’URL.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Salle — Réservations</h1>
          <p className="text-sm text-slate-400">
            Vue temps réel des réservations (bot + téléphone).
          </p>
        </div>
        <button
          onClick={loadReservations}
          className="rounded-md border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
        >
          Rafraîchir
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md bg-red-900/40 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-4 text-sm text-slate-300">Chargement…</div>
      )}

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {STATUS_ORDER.map((status) => {
          const list = reservations.filter((r) => r.status === status);
          return (
            <section
              key={status}
              className="flex flex-col rounded-xl bg-slate-800/70 p-3"
            >
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                {STATUS_LABELS[status]} ({list.length})
              </h2>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {list.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-lg bg-slate-900/60 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{r.client_name}</span>
                      <span className="text-xs text-slate-400">
                        {formatTime(r.reservation_time)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-300">
                      {r.party_size} pers.
                      {r.phone ? ` • ${r.phone}` : ''}
                    </div>
                    {r.notes && (
                      <div className="mt-1 text-xs text-slate-400">
                        {r.notes}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {status !== 'new' && (
                        <button
                          onClick={() => updateStatus(r.id, 'new')}
                          className="rounded-md bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                        >
                          New
                        </button>
                      )}
                      {status !== 'confirmed' && (
                        <button
                          onClick={() => updateStatus(r.id, 'confirmed')}
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600"
                        >
                          Confirmée
                        </button>
                      )}
                      {status !== 'seated' && (
                        <button
                          onClick={() => updateStatus(r.id, 'seated')}
                          className="rounded-md bg-blue-700 px-2 py-1 text-xs hover:bg-blue-600"
                        >
                          En salle
                        </button>
                      )}
                      {status !== 'cancelled' && (
                        <button
                          onClick={() => updateStatus(r.id, 'cancelled')}
                          className="rounded-md bg-rose-700 px-2 py-1 text-xs hover:bg-rose-600"
                        >
                          Annulée
                        </button>
                      )}
                      {status !== 'no_show' && (
                        <button
                          onClick={() => updateStatus(r.id, 'no_show')}
                          className="rounded-md bg-orange-700 px-2 py-1 text-xs hover:bg-orange-600"
                        >
                          No show
                        </button>
                      )}
                    </div>
                  </article>
                ))}

                {list.length === 0 && (
                  <div className="text-xs text-slate-500">
                    Aucune réservation pour ce statut.
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
