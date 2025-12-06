// lib/checkAdminAuth.ts

// Auth très simple : on compare un header custom x-admin-key
// avec la variable d'environnement ADMIN_API_KEY.
export function checkAdminAuth(headers: Headers): boolean {
  const token = process.env.ADMIN_API_KEY;
  if (!token) {
    console.error('[checkAdminAuth] ADMIN_API_KEY is NOT set on server');
    return false;
  }

  // On lit le header custom (sans transformation par des proxies)
  const headerKey = headers.get('x-admin-key');
  if (!headerKey) {
    console.warn('[checkAdminAuth] Missing x-admin-key header');
    return false;
  }

  const ok = headerKey === token;

  if (!ok) {
    console.warn('[checkAdminAuth] x-admin-key mismatch');
  }

  return ok;
}
