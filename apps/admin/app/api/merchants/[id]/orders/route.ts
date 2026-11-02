import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Read — open to every active admin, like GET /api/merchants/[id].
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone:phone, total_iqd:price, status, created_at, updated_at, items"
      )
      .eq("tenant_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // The orders table stores line items as jsonb and has no items_count column.
    const orders = (data ?? []).map(({ items, ...order }) => ({
      ...order,
      items_count: Array.isArray(items) ? items.length : 0,
    }));

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Recent orders API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent orders" },
      { status: 500 }
    );
  }
}
