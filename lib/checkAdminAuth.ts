// lib/checkAdminAuth.ts

// Auth très simple : on compare un header custom x-admin-key
// avec la variable d'environnement ADMIN_API_KEY.
// On "trim" les deux valeurs pour ignorer les espaces / retours à la ligne.

export function checkAdminAuth(headers: Headers): boolean {
  const rawToken = process.env.ADMIN_API_KEY;

  if (!rawToken) {
    console.error('[checkAdminAuth] ADMIN_API_KEY is NOT set on server');
    return false;
  }

  const token = rawToken.trim(); // on enlève espaces / \n éventuels
  const rawHeader = headers.get('x-admin-key');

  if (!rawHeader) {
    console.warn('[checkAdminAuth] Missing x-admin-key header');
    return false;
  }

  const headerKey = rawHeader.trim(); // idem côté requête

  const ok = headerKey === token;

  if (!ok) {
    console.warn('[checkAdminAuth] x-admin-key mismatch', {
      tokenLen: token.length,
      headerLen: headerKey.length,
    });
  }

  return ok;
}
