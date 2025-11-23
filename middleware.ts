// middleware.ts (à la racine du projet)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 🔐 On récupère login + mot de passe depuis .env.local
const BASIC_USER = process.env.DASHBOARD_USER;
const BASIC_PASS = process.env.DASHBOARD_PASS;


export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // On ne protège que /dashboard
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  const authHeader = req.headers.get("authorization");

  // Pas d'en-tête Authorization -> on demande un login
  if (!authHeader) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Call2Eat Dashboard"',
      },
    });
  }

  // Format attendu : "Basic base64(user:pass)"
  const [type, credentials] = authHeader.split(" ");

  if (type !== "Basic" || !credentials) {
    return new NextResponse("Invalid authorization header", { status: 401 });
  }

  const decoded = Buffer.from(credentials, "base64").toString("utf-8");
  const [user, pass] = decoded.split(":");

  if (user !== BASIC_USER || pass !== BASIC_PASS) {
    return new NextResponse("Invalid credentials", { status: 401 });
  }

  // OK → on laisse passer vers /dashboard
  return NextResponse.next();
}

// On applique le middleware uniquement sur /dashboard
export const config = {
  matcher: ["/dashboard"],
};
