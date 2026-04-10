import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const plan = searchParams.get("plan");
    const status = searchParams.get("status");
    const city = searchParams.get("city");
    const search = searchParams.get("search");
    const balance = searchParams.get("balance");
    const health = searchParams.get("health");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");
    const sortParam = searchParams.get("sort") ?? "created_at:desc";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));
    const includeSparkline = searchParams.get("include_sparkline") === "true";

    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    // ── Main query ─────────────────────────────────────────────────────
    let query = supabase
      .from("tenants")
      .select("*, wallet(*), subscriptions(*)", { count: "exact" });

    if (plan) query = query.eq("plan", plan);
    if (status) query = query.eq("status", status);
    if (city) query = query.eq("city", city);

    if (search) {
      query = query.or(
        `business_name.ilike.%${search}%,slug.ilike.%${search}%,contact_email.ilike.%${search}%`
      );
    }

    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    // ── Multi-column sort ──────────────────────────────────────────────
    const sortParts = sortParam.split(",").filter(Boolean);
    for (const part of sortParts) {
      const [col, dir] = part.split(":");
      if (col) {
        query = query.order(col, { ascending: dir === "asc" });
      }
    }

    query = query.range(offset, offset + limit - 1);

    const { data: tenants, error, count } = await query;

    if (error) throw error;

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({
        merchants: [],
        total: count ?? 0,
        page,
        limit,
      });
    }

    // ── Compute additional fields per merchant ─────────────────────────
    const tenantIds = tenants.map((t) => t.id);

    // Fetch last activity (latest wallet transaction) per tenant
    const { data: lastActivity } = await supabase
      .from("wallet_transactions")
      .select("tenant_id, created_at")
      .in("tenant_id", tenantIds)
      .order("created_at", { ascending: false });

    // Compute last_active_at per tenant (first occurrence = latest due to order)
    const lastActiveMap = new Map<string, string>();
    if (lastActivity) {
      for (const row of lastActivity) {
        if (!lastActiveMap.has(row.tenant_id)) {
          lastActiveMap.set(row.tenant_id, row.created_at);
        }
      }
    }

    // Fetch monthly revenue (charges in last 30 days) per tenant
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: revenueData } = await supabase
      .from("wallet_transactions")
      .select("tenant_id, amount_iqd")
      .in("tenant_id", tenantIds)
      .eq("type", "charge")
      .gte("created_at", thirtyDaysAgo);

    const revenueMap = new Map<string, number>();
    if (revenueData) {
      for (const row of revenueData) {
        revenueMap.set(
          row.tenant_id,
          (revenueMap.get(row.tenant_id) ?? 0) + Math.abs(row.amount_iqd)
        );
      }
    }

    // Fetch sparkline data if requested (daily order counts for last 30 days)
    const sparklineMap = new Map<string, number[]>();
    if (includeSparkline) {
      const { data: orders } = await supabase
        .from("orders")
        .select("tenant_id, created_at")
        .in("tenant_id", tenantIds)
        .gte("created_at", thirtyDaysAgo);

      if (orders) {
        // Group orders by tenant and day
        const now = new Date();
        for (const tid of tenantIds) {
          const counts = new Array(30).fill(0);
          sparklineMap.set(tid, counts);
        }

        for (const order of orders) {
          const dayDiff = Math.floor(
            (now.getTime() - new Date(order.created_at).getTime()) / (24 * 60 * 60 * 1000)
          );
          const idx = 29 - Math.min(dayDiff, 29);
          const arr = sparklineMap.get(order.tenant_id);
          if (arr) arr[idx]++;
        }
      }
    }

    // Fetch usage data (orders_count) per tenant from usage_tracking
    const { data: usageData } = await supabase
      .from("usage_tracking")
      .select("tenant_id, orders_count, orders_charged, team_members_count")
      .in("tenant_id", tenantIds)
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    // Get the latest usage per tenant
    const usageMap = new Map<string, { orders_count: number; orders_charged: number; team_members_count: number }>();
    if (usageData) {
      for (const row of usageData) {
        if (!usageMap.has(row.tenant_id)) {
          usageMap.set(row.tenant_id, {
            orders_count: row.orders_count,
            orders_charged: row.orders_charged,
            team_members_count: row.team_members_count,
          });
        }
      }
    }

    // ── Assemble enriched merchants ────────────────────────────────────
    let merchants = tenants.map((tenant) => ({
      ...tenant,
      tags: tenant.tags ?? [],
      last_active_at: lastActiveMap.get(tenant.id) ?? null,
      monthly_revenue: revenueMap.get(tenant.id) ?? 0,
      order_sparkline: sparklineMap.get(tenant.id) ?? [],
      usage: usageMap.get(tenant.id) ?? null,
    }));

    // ── Client-side-like filters that need computed data ────────────────
    if (balance) {
      merchants = merchants.filter((m) => {
        const bal = m.wallet?.balance_iqd ?? 0;
        switch (balance) {
          case "critical": return bal < 10000;
          case "low": return bal >= 10000 && bal <= 50000;
          case "healthy": return bal > 50000;
          default: return true;
        }
      });
    }

    if (health) {
      merchants = merchants.filter((m) => {
        const score = computeHealthScore(m);
        switch (health) {
          case "at_risk": return score < 40;
          case "warning": return score >= 40 && score < 70;
          case "healthy": return score >= 70;
          default: return true;
        }
      });
    }

    return NextResponse.json({
      merchants,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("Merchants API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch merchants" },
      { status: 500 }
    );
  }
}

// ── Health score calculation (mirrors client-side logic) ────────────────
function computeHealthScore(merchant: Record<string, unknown>): number {
  let score = 50;
  const status = merchant.status as string;
  const wallet = merchant.wallet as { balance_iqd: number } | null;
  const usage = merchant.usage as { orders_count: number } | null;
  const plan = merchant.plan as string;

  if (status === "active") score += 15;
  else if (status === "trial") score += 5;
  else if (status === "suspended") score -= 20;

  const balance = wallet?.balance_iqd ?? 0;
  if (balance > 50000) score += 15;
  else if (balance > 10000) score += 5;
  else score -= 10;

  const orders = usage?.orders_count ?? 0;
  if (orders > 50) score += 15;
  else if (orders > 10) score += 10;
  else if (orders > 0) score += 5;

  if (plan === "enterprise") score += 5;
  else if (plan === "professional") score += 3;

  return Math.max(0, Math.min(100, score));
}
