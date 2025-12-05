// app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Call2Eat',
    short_name: 'Call2Eat',
    description: 'Vue cuisine en temps réel pour les commandes Call2Eat.',
    start_url: '/kitchen',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#020617', // fond sombre (bg-slate-950)
    theme_color: '#f97316',      // orange Call2Eat
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-256.png',
        sizes: '256x256',
        type: 'image/png',
      },
      {
        src: '/icons/icon-384.png',
        sizes: '384x384',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
