// lib/checkAdminAuth.ts
export function checkAdminAuth(headers: Headers) {
  const token = process.env.ADMIN_API_KEY;
  if (!token) return false;

  const auth = headers.get("authorization");
  if (!auth) return false;

  const parts = auth.split(" ");
  if (parts.length !== 2) return false;

  const [type, value] = parts;
  if (type.toLowerCase() !== "bearer") return false;

  return value === token;
}
