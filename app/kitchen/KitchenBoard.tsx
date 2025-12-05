'use client';

import React, { useEffect, useState } from 'react';
import type { KitchenOrder } from './page';

type KitchenBoardProps = {
  initialOrders: KitchenOrder[];
};

/**
 * Formatage de l'heure côté client
 */
function formatTime(dateString: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Petit bip audio (sans fichier, via Web Audio)
 */
function playBeepOnce() {
  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 880; // Hz
    gain.gain.value = 0.05;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 350);
  } catch {
    // si le navigateur bloque, on ne fait rien
  }
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'new':
      return 'new';
    case 'in_progress':
      return 'en cours';
    case 'done':
      return 'terminée';
    case 'confirmed':
      return 'confirmée';
    default:
      return '—';
  }
}

/**
 * Composant client :
 * - drag & drop visuel pour réorganiser les cartes
 * - nouvelles commandes (status === 'new') qui clignotent + “secouent”
 *   jusqu'à première interaction
 * - badge "Humain" si needs_human === true
 * - boutons de statut qui écrivent dans /api/orders/status
 */
export default function KitchenBoard({ initialOrders }: KitchenBoardProps) {
  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);

  // Id de la carte en cours de drag
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Ids des commandes qui clignotent => seulement celles en "new"
  const [flashIds, setFlashIds] = useState<string[]>(() =>
    initialOrders.filter((o) => o.status === 'new').map((o) => o.id),
  );

  const [hasPlayedSound, setHasPlayedSound] = useState(false);

  // Son d'alerte si au moins une commande "new" au chargement
  useEffect(() => {
    if (flashIds.length > 0 && !hasPlayedSound) {
      playBeepOnce();
      setHasPlayedSound(true);
    }
  }, [flashIds.length, hasPlayedSound]);

  const markAsSeen = (orderId: string) => {
    setFlashIds((prev) => prev.filter((id) => id !== orderId));
  };

  const handleDragStart = (orderId: string) => {
    setDraggingId(orderId);
    markAsSeen(orderId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    event.preventDefault();
    if (!draggingId || draggingId === targetId) return;

    setOrders((prev) => {
      const currentIndex = prev.findIndex((o) => o.id === draggingId);
      const targetIndex = prev.findIndex((o) => o.id === targetId);
      if (currentIndex === -1 || targetIndex === -1) return prev;

      const newArray = [...prev];
      const [moved] = newArray.splice(currentIndex, 1);
      newArray.splice(targetIndex, 0, moved);
      return newArray;
    });
  };

  const handleCardClick = (orderId: string) => {
    markAsSeen(orderId);
  };

  const handleCardMouseEnter = (orderId: string) => {
    markAsSeen(orderId);
  };

  /**
   * Changement de statut : new / in_progress / done
   * -> met à jour le state local immédiatement
   * -> envoie ensuite la maj à l'API
   */
  const handleStatusChange = async (
    orderId: string,
    newStatus: 'new' | 'in_progress' | 'done',
  ) => {
    markAsSeen(orderId);

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: newStatus } : o,
      ),
    );

    try {
      await fetch('/api/orders/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_id: orderId,
          status: newStatus,
        }),
      });
    } catch (err) {
      console.error('Erreur maj statut commande:', err);
      // en cas d'erreur réseau, on pourrait recharger la page plus tard
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {orders.map((order) => {
        const isFlashing = flashIds.includes(order.id);

        const statusColor =
          order.status === 'new'
            ? 'bg-amber-400'
            : order.status === 'in_progress' || order.status === 'confirmed'
            ? 'bg-sky-400'
            : order.status === 'done'
            ? 'bg-emerald-400'
            : 'bg-slate-400';

        return (
          <div
            key={order.id}
            draggable
            onDragStart={() => handleDragStart(order.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, order.id)}
            onClick={() => handleCardClick(order.id)}
            onMouseEnter={() => handleCardMouseEnter(order.id)}
            onTouchStart={() => handleCardClick(order.id)}
            className={`rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-lg cursor-move transition-transform ${
              draggingId === order.id ? 'opacity-80 scale-[0.99]' : ''
            } ${
              isFlashing
                ? 'animate-pulse ring-2 ring-amber-400/70'
                : 'hover:border-amber-400/60'
            }`}
          >
            {/* En-tête commande */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Commande
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-semibold">
                    {order.client_name ?? 'Client inconnu'}
                  </div>
                  {order.needs_human && (
                    <span className="inline-flex items-center rounded-full bg-rose-600/20 text-rose-200 border border-rose-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      👤 Humain
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">
                  {formatTime(order.created_at)}
                </div>
                <div className="text-xs text-slate-300">
                  {order.client_phone ?? '—'}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="mt-3 space-y-1">
              {order.items.length === 0 && (
                <p className="text-sm text-slate-400">Aucun détail d&apos;articles.</p>
              )}

              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="font-semibold">
                    {item.qty} × {item.product_name ?? `Produit #${item.product_id}`}
                  </div>
                  <div className="text-slate-400 text-xs">
                    {item.unit_price.toFixed(2)} €
                  </div>
                </div>
              ))}
            </div>

            {/* Note cuisine */}
            {order.note && (
              <div className="mt-3 rounded-xl bg-slate-800 px-3 py-2 text-xs text-amber-200 border border-amber-400/40">
                <span className="font-semibold">Note cuisine :</span> {order.note}
              </div>
            )}

            {/* Statut + boutons + ID courte */}
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-1">
                  <span
                    className={`mr-1 h-1.5 w-1.5 rounded-full ${statusColor} ${
                      isFlashing ? 'animate-bounce' : ''
                    }`}
                  />
                  {statusLabel(order.status)}
                </span>
                <span className="text-slate-400">
                  ID courte : {order.id.slice(0, 8)}…
                </span>
              </div>

              {/* Boutons de statut */}
              <div className="flex flex-wrap gap-1 justify-end">
                <button
                  type="button"
                  onClick={() => handleStatusChange(order.id, 'new')}
                  className={`px-2 py-1 rounded-full border text-[11px] ${
                    order.status === 'new'
                      ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                      : 'border-slate-700 text-slate-300 hover:border-amber-400/70'
                  }`}
                >
                  New
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(order.id, 'in_progress')}
                  className={`px-2 py-1 rounded-full border text-[11px] ${
                    order.status === 'in_progress' || order.status === 'confirmed'
                      ? 'border-sky-400 text-sky-200 bg-sky-500/10'
                      : 'border-slate-700 text-slate-300 hover:border-sky-400/70'
                  }`}
                >
                  En cours
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(order.id, 'done')}
                  className={`px-2 py-1 rounded-full border text-[11px] ${
                    order.status === 'done'
                      ? 'border-emerald-400 text-emerald-200 bg-emerald-500/10'
                      : 'border-slate-700 text-slate-300 hover:border-emerald-400/70'
                  }`}
                >
                  Terminé
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
