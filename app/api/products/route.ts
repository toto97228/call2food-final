// app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkAdminAuth } from "@/lib/checkAdminAuth";

// GET /api/products
export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*") // on prend toutes les colonnes existantes
      .order("id", { ascending: true });

    if (error) {
      console.error("GET /api/products error:", error);
      return NextResponse.json(
        { error: "database_error", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ products: data ?? [] });
  } catch (err) {
    console.error("GET /api/products exception:", err);
    return NextResponse.json(
      { error: "unexpected_error" },
      { status: 500 }
    );
  }
}

// POST /api/products : créer un nouveau produit
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 }
    );
  }

  const { name, base_price, available, stock_note } = body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "name_required" },
      { status: 400 }
    );
  }

  if (
    typeof base_price !== "number" ||
    Number.isNaN(base_price) ||
    base_price <= 0
  ) {
    return NextResponse.json(
      { error: "base_price_invalid" },
      { status: 400 }
    );
  }

  const insertData: any = {
    name: name.trim(),
    base_price,
  };

  if (typeof available === "boolean") insertData.available = available;
  if (typeof stock_note === "string") insertData.stock_note = stock_note;

  const { data, error } = await supabaseAdmin
    .from("products")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json(
      { error: "database_error", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
