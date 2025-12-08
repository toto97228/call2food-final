// app/room/page.tsx
import ThemeToggle from "@/app/dashboard/ThemeToggle";
import ReservationsBoard from "./ReservationsBoard";

export const dynamic = "force-dynamic";

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
                Gestion des réservations de table
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <ReservationsBoard />
      </div>
    </main>
  );
}
