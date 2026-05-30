import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenant_id");

  try {
    // Query orders for the last 365 days
    let query = supabase
      .from("orders")
      .select("id, created_at, tenant_id")
      .gte("created_at", new Date(Date.now() - 365 * 86400000).toISOString())
      .order("created_at", { ascending: true });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data: orders, error } = await query;
    if (error) throw error;

    // --- Daily counts for heatmap (365 days) ---
    const dailyCounts: Record<string, number> = {};
    const hourlyCounts: number[] = new Array(24).fill(0);

    (orders || []).forEach((order) => {
      const d = new Date(order.created_at);
      const dateKey = d.toISOString().split("T")[0];
      dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
      hourlyCounts[d.getHours()] += 1;
    });

    // Fill in missing days
    const heatmapData: Array<{ date: string; count: number }> = [];
    const today = new Date();
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      heatmapData.push({ date: key, count: dailyCounts[key] || 0 });
    }

    // --- Top busiest / quietest days ---
    const sortedDays = [...heatmapData].filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
    const busiestDays = sortedDays.slice(0, 10);
    const quietestDays = sortedDays.length > 10
      ? [...sortedDays].sort((a, b) => a.count - b.count).slice(0, 10)
      : [];

    // --- Weekly trend ---
    const weeklyTrend: Array<{ week: string; count: number }> = [];
    for (let w = 51; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - w * 7 - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const startKey = weekStart.toISOString().split("T")[0];
      const endKey = weekEnd.toISOString().split("T")[0];
      const count = heatmapData
        .filter((d) => d.date >= startKey && d.date <= endKey)
        .reduce((s, d) => s + d.count, 0);
      weeklyTrend.push({ week: startKey, count });
    }

    // Total orders
    const totalOrders = (orders || []).length;

    return NextResponse.json({
      heatmapData,
      hourlyCounts,
      busiestDays,
      quietestDays,
      weeklyTrend,
      totalOrders,
    });
  } catch (error) {
    console.error("Usage API error:", error);
    return NextResponse.json({ error: "Failed to fetch usage data" }, { status: 500 });
  }
}
