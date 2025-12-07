// lib/checkAdminAuth.ts

// Auth staff simple :
// - soit via query string ?admin_key=XXX
// - soit via header x-admin-key: XXX
// Les valeurs sont "trim" pour éviter les problèmes d'espaces / retours à la ligne.

export function checkAdminAuth(headers: Headers, url?: string): boolean {
  const rawToken = process.env.ADMIN_API_KEY;

  if (!rawToken) {
    console.error('[checkAdminAuth] ADMIN_API_KEY is NOT set on server');
    return false;
  }

  const token = rawToken.trim();

  let candidate: string | null = null;

  // 1) Essayer d'abord de lire ?admin_key=... dans l'URL
  if (url) {
    try {
      const u = new URL(url);
      const qsKey = u.searchParams.get('admin_key');
      if (qsKey && qsKey.trim().length > 0) {
        candidate = qsKey.trim();
      }
    } catch (e) {
      console.warn('[checkAdminAuth] Invalid URL passed to checkAdminAuth');
    }
  }

  // 2) Sinon, regarder le header x-admin-key
  if (!candidate) {
    const rawHeader = headers.get('x-admin-key');
    if (rawHeader && rawHeader.trim().length > 0) {
      candidate = rawHeader.trim();
    }
  }

  if (!candidate) {
    console.warn('[checkAdminAuth] No admin key provided (header or query)');
    return false;
  }

  const ok = candidate === token;

  if (!ok) {
    console.warn('[checkAdminAuth] admin key mismatch');
  }

  return ok;
}
