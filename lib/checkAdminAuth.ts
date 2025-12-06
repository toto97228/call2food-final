// lib/checkAdminAuth.ts
export function checkAdminAuth(headers: Headers): boolean {
  const token = process.env.ADMIN_API_KEY;

  if (!token) {
    console.error('[checkAdminAuth] ADMIN_API_KEY is NOT set on server');
    return false;
  }

  const auth = headers.get('authorization');
  if (!auth) {
    console.warn('[checkAdminAuth] Missing Authorization header');
    return false;
  }

  const parts = auth.split(' ');
  if (parts.length !== 2) {
    console.warn('[checkAdminAuth] Malformed Authorization header:', auth);
    return false;
  }

  const [type, value] = parts;
  if (type.toLowerCase() !== 'bearer') {
    console.warn('[checkAdminAuth] Invalid auth scheme:', type);
    return false;
  }

  const ok = value === token;

  if (!ok) {
    console.warn('[checkAdminAuth] ADMIN_API_KEY mismatch');
  }

  return ok;
}
