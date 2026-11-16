import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { fetchMerchantListStats } from "@/lib/console-stats";
import { everyRow } from "@/lib/every-row";
import { merchantSearchFilter } from "@/lib/merchant-search";

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
      // Every shop, a page at a time: one request stops at 1,000 rows.
      const lite = await everyRow((from, to) =>
        supabase
          .from("tenants")
          .select("id, status, trial_ends_at, wallet(balance_iqd)")
          .order("id", { ascending: true })
          .range(from, to),
      );
      const now = Date.now();
      attentionIds = [];
      for (const t of lite) {
        const s = t.status as string;
        const trialEnd = t.trial_ends_at as string | null;
        const walletRel = t.wallet as { balance_iqd?: number } | { balance_iqd?: number }[] | null;
        const bal = Array.isArray(walletRel) ? walletRel[0]?.balance_iqd ?? 0 : walletRel?.balance_iqd ?? 0;

        let attn = false;
        if (s === "suspended" || s === "cancelled") attn = true;
        if (s === "trial" && trialEnd) {
          const daysLeft = Math.ceil((new Date(trialEnd).getTime() - now) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 3) attn = true;
        }
        if (bal < 5000 && s !== "cancelled") attn = true;
        if (attn) attentionIds.push(t.id);
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

    if (search) query = query.or(merchantSearchFilter(search));

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

    // Shops made in the same instant need a fixed order, or a page boundary can skip or repeat one.
    query = query.order("id", { ascending: true });

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

    // ── Numbers per merchant ───────────────────────────────────────────
    // Counted in the database (admin_merchant_list_stats): real orders and our
    // fees over the last 30 Baghdad days, the last order and wallet line, the
    // newest usage row and the billing lock. A failed read fails the request;
    // it never draws a busy shop as a quiet one.
    const tenantIds = tenants.map((t) => t.id);

    const [stats, pinned] = await Promise.all([
      fetchMerchantListStats(supabase, tenantIds),
      // Most recent pinned note per tenant wins.
      supabase
        .from("admin_notes")
        .select("tenant_id, content, updated_at, admin_label")
        .in("tenant_id", tenantIds)
        .eq("is_pinned", true)
        .order("updated_at", { ascending: false }),
    ]);
    if (pinned.error) throw pinned.error;

    const pinnedNoteMap = new Map<string, { content: string; updated_at: string; admin_label: string | null }>();
    for (const note of pinned.data ?? []) {
      if (!pinnedNoteMap.has(note.tenant_id)) {
        pinnedNoteMap.set(note.tenant_id, {
          content: note.content,
          updated_at: note.updated_at,
          admin_label: note.admin_label ?? null,
        });
      }
    }

    // ── Assemble enriched merchants ────────────────────────────────────
    let merchants = tenants.map((tenant) => {
      const row = stats.get(tenant.id);
      if (!row) throw new Error(`No list numbers for shop ${tenant.id}`);

      return {
        ...tenant,
        tags: tenant.tags ?? [],
        // The later of the last wallet line and the last real order.
        last_active_at: laterOf(row.last_wallet_at, row.last_order_at),
        // Our fees (monthly fee, delivered orders, messages), not every wallet charge.
        monthly_revenue: row.fees_30d,
        daily_revenue: row.fees_today,
        orders_30d: row.orders_30d,
        order_sparkline: includeSparkline ? row.order_sparkline : [],
        usage:
          row.usage_orders_count === null
            ? null
            : {
                orders_count: row.usage_orders_count,
                orders_charged: row.usage_orders_charged ?? 0,
                team_members_count: row.usage_team_members_count ?? 0,
              },
        // A locked shop still has status "trial" or "active"; this is what tells them apart.
        billing_lock: row.lock_reason ? { reason: row.lock_reason, since: row.lock_since } : null,
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

/** The later of two instants; either may be missing. */
function laterOf(a: string | null, b: string | null): string | null {
  if (!a || !b) return a ?? b;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

// ── Health score calculation (mirrors client-side logic) ────────────────
function computeHealthScore(merchant: Record<string, unknown>): number {
  let score = 50;
  const status = merchant.status as string;
  const wallet = merchant.wallet as { balance_iqd: number } | null;
  const usage = merchant.usage as { orders_count: number } | null;

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

  return Math.max(0, Math.min(100, score));
}
