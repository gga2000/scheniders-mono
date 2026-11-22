import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Read — open to every active admin, like GET /api/merchants/[id].
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, customer_name, customer_phone:phone, total_iqd:price, status, is_return, created_at, updated_at, items"
      )
      .eq("tenant_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // The orders table stores line items as jsonb and has no items_count column.
    // is_return marks a refund order (money going back to the customer); it
    // may be null on old rows, which are sales.
    const orders = (data ?? []).map(({ items, is_return, ...order }) => ({
      ...order,
      is_return: is_return === true,
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
