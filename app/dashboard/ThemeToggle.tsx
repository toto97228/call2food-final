'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  // Au chargement : lire le thème stocké ou utiliser le thème système
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = window.localStorage.getItem('c2e-theme') as Theme | null;
    const initial: Theme =
      saved ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');

    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  // Changer de thème + sauvegarder
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('c2e-theme', next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--card-bg-soft)] transition"
    >
      <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
      {theme === 'dark' ? 'Mode nuit' : 'Mode clair'}
    </button>
  );
}
