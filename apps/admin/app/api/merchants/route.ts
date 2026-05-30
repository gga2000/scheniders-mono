import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

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

    // ── Resolve "attention" filter to a tenant-id allowlist ────────────
    // "attention" combines status + trial date math + balance threshold,
    // none of which can be expressed as a single Supabase filter. Compute
    // the matching ids in Node, then constrain the main query.
    let attentionIds: string[] | null = null;
    if (status === "attention") {
      const { data: lite } = await supabase
        .from("tenants")
        .select("id, status, trial_ends_at, wallet(balance_iqd)");
      if (lite) {
        const now = Date.now();
        attentionIds = [];
        for (const t of lite) {
          const s = (t as { status?: string }).status;
          const trialEnd = (t as { trial_ends_at?: string | null }).trial_ends_at;
          const walletRel = (t as {
            wallet?: { balance_iqd?: number } | { balance_iqd?: number }[];
          }).wallet;
          const bal = Array.isArray(walletRel)
            ? walletRel[0]?.balance_iqd ?? 0
            : walletRel?.balance_iqd ?? 0;

          let attn = false;
          if (s === "suspended" || s === "cancelled") attn = true;
          if (s === "trial" && trialEnd) {
            const daysLeft = Math.ceil(
              (new Date(trialEnd).getTime() - now) / (1000 * 60 * 60 * 24)
            );
            if (daysLeft <= 3) attn = true;
          }
          if (bal < 5000 && s !== "cancelled") attn = true;
          if (attn) attentionIds.push(t.id);
        }
      } else {
        attentionIds = [];
      }
    }

    // ── Main query ─────────────────────────────────────────────────────
    let query = supabase
      .from("tenants")
      .select("*, wallet(*), subscriptions(*)", { count: "exact" });

    if (plan) query = query.eq("plan", plan);
    // "attention" is synthetic — never forward as a column filter.
    if (status && status !== "attention") query = query.eq("status", status);
    if (city) query = query.eq("city", city);
    if (attentionIds !== null) {
      if (attentionIds.length === 0) {
        // No matches — return empty without a round-trip.
        return NextResponse.json({ merchants: [], total: 0, page, limit });
      }
      query = query.in("id", attentionIds);
    }

    if (search) {
      // If the query looks like a merchant code (digits, optional leading #),
      // include display_id::text in the OR so server-side search works.
      const codeQuery = search.trim().replace(/^#/, "");
      const isCode = /^\d{1,6}$/.test(codeQuery);
      const escaped = search.replace(/[%,]/g, "");
      const parts = [
        `business_name.ilike.%${escaped}%`,
        `slug.ilike.%${escaped}%`,
        `contact_email.ilike.%${escaped}%`,
      ];
      if (isCode) {
        parts.push(`display_id::text.ilike.${codeQuery}%`);
      }
      query = query.or(parts.join(","));
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

    // Fetch monthly + daily revenue (charges in last 30 days) per tenant
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();
    const { data: revenueData } = await supabase
      .from("wallet_transactions")
      .select("tenant_id, amount_iqd, created_at")
      .in("tenant_id", tenantIds)
      .eq("type", "charge")
      .gte("created_at", thirtyDaysAgo);

    const revenueMap = new Map<string, number>();
    const dailyRevenueMap = new Map<string, number>();
    if (revenueData) {
      for (const row of revenueData) {
        const amount = Math.abs(row.amount_iqd);
        revenueMap.set(
          row.tenant_id,
          (revenueMap.get(row.tenant_id) ?? 0) + amount
        );
        if (new Date(row.created_at).getTime() >= startOfTodayMs) {
          dailyRevenueMap.set(
            row.tenant_id,
            (dailyRevenueMap.get(row.tenant_id) ?? 0) + amount
          );
        }
      }
    }

    // Fetch 30-day rolling orders per tenant. Used for:
    //   - per-card "orders" count (same window as monthly_revenue)
    //   - sparkline (when requested)
    //   - last-active fallback when no wallet transactions exist
    const orders30dMap = new Map<string, number>();
    const orderLastSeenMap = new Map<string, string>();
    const sparklineMap = new Map<string, number[]>();

    const { data: orderRows } = await supabase
      .from("orders")
      .select("tenant_id, created_at")
      .in("tenant_id", tenantIds)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    if (orderRows) {
      const now = new Date();
      if (includeSparkline) {
        for (const tid of tenantIds) {
          sparklineMap.set(tid, new Array(30).fill(0));
        }
      }
      for (const order of orderRows) {
        orders30dMap.set(
          order.tenant_id,
          (orders30dMap.get(order.tenant_id) ?? 0) + 1
        );
        if (!orderLastSeenMap.has(order.tenant_id)) {
          orderLastSeenMap.set(order.tenant_id, order.created_at);
        }
        if (includeSparkline) {
          const dayDiff = Math.floor(
            (now.getTime() - new Date(order.created_at).getTime()) /
              (24 * 60 * 60 * 1000)
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

    // Fetch pinned notes per tenant (most recent pinned note wins)
    const { data: pinnedNotes } = await supabase
      .from("admin_notes")
      .select("tenant_id, content, updated_at, admin_label")
      .in("tenant_id", tenantIds)
      .eq("is_pinned", true)
      .order("updated_at", { ascending: false });

    const pinnedNoteMap = new Map<
      string,
      { content: string; updated_at: string; admin_label: string | null }
    >();
    if (pinnedNotes) {
      for (const note of pinnedNotes) {
        if (!pinnedNoteMap.has(note.tenant_id)) {
          pinnedNoteMap.set(note.tenant_id, {
            content: note.content,
            updated_at: note.updated_at,
            admin_label: note.admin_label ?? null,
          });
        }
      }
    }

    // ── Assemble enriched merchants ────────────────────────────────────
    let merchants = tenants.map((tenant) => {
      // last_active_at = most recent of (latest wallet tx, latest order).
      // Without this fallback, merchants with orders but no charges yet
      // show no activity timestamp on the card.
      const walletLast = lastActiveMap.get(tenant.id);
      const orderLast = orderLastSeenMap.get(tenant.id);
      const lastActive =
        walletLast && orderLast
          ? walletLast > orderLast
            ? walletLast
            : orderLast
          : walletLast ?? orderLast ?? null;

      return {
        ...tenant,
        tags: tenant.tags ?? [],
        last_active_at: lastActive,
        monthly_revenue: revenueMap.get(tenant.id) ?? 0,
        daily_revenue: dailyRevenueMap.get(tenant.id) ?? 0,
        orders_30d: orders30dMap.get(tenant.id) ?? 0,
        order_sparkline: sparklineMap.get(tenant.id) ?? [],
        usage: usageMap.get(tenant.id) ?? null,
        pinned_note: pinnedNoteMap.get(tenant.id) ?? null,
      };
    });

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
