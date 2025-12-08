// app/room/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import ThemeToggle from "@/app/dashboard/ThemeToggle";
import ReservationsBoard from "./ReservationsBoard";

export default function RoomPage() {
  return (
    <main className="min-h-screen bg-[#FFF3E2] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-orange-100/70 bg-[#FFE4C2]/90 backdrop-blur dark:bg-slate-900 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-400 shadow-sm text-white text-sm font-bold">
              C2
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Call2Eat – Vue salle
              </div>
              <div className="text-xs text-orange-700/80 dark:text-slate-400">
                Gestion des réservations
              </div>
            </div>
          </div>

          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Suspense
          fallback={
            <div className="rounded-2xl bg-white shadow-sm border border-orange-100 p-4 text-xs text-orange-800/80 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300">
              Chargement des réservations…
            </div>
          }
        >
          <ReservationsBoard />
        </Suspense>
      </div>
    </main>
  );
}
