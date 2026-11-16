import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { readDayRange } from "@/lib/baghdad-day";
import { fetchMerchantListStats } from "@/lib/console-stats";
import { ATTENTION, computedShopFilters } from "@/lib/merchant-filters";
import { merchantSearchFilter } from "@/lib/merchant-search";
import { DEFAULT_MERCHANT_SORT, readMerchantSort } from "@/lib/merchant-sort";

/** The "ids" query value, when it is given: shop ids. */
const shopIdsSchema = z.array(z.string().uuid()).min(1).max(50).optional();

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
    // Sign-up days, on the Baghdad calendar.
    const days = readDayRange(searchParams);
    if ("error" in days) return NextResponse.json({ error: days.error }, { status: 400 });
    const sort = readMerchantSort(searchParams.get("sort") || DEFAULT_MERCHANT_SORT);
    if ("error" in sort) return NextResponse.json({ error: sort.error }, { status: 400 });
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "50")));
    const includeSparkline = searchParams.get("include_sparkline") === "true";
    // "ids=a,b": only these shops, for a screen that shows named shops with the list's numbers.
    const ids = shopIdsSchema.safeParse(searchParams.get("ids")?.split(",") ?? undefined);
    if (!ids.success) {
      return NextResponse.json({ error: "ids must be shop ids, at most 50" }, { status: 400 });
    }

    const offset = (page - 1) * limit;

    const supabase = createAdminClient();

    // ── Main query ─────────────────────────────────────────────────────
    let query = supabase
      .from("tenants")
      // The health score and its parts are the database's: the browser shows them and works nothing out.
      // Staff tags live in staff_shop_tags, which merchants cannot read.
      .select("*, wallet(*), subscriptions(*), staff_shop_tags(tags), staff_health_score, staff_health_parts", {
        count: "exact",
      })
      // The demo store (Fermi B13) has its own card, not a row among customers.
      .eq("is_demo", false);

    if (ids.data) query = query.in("id", ids.data);
    if (plan) query = query.eq("plan", plan);
    // "attention" is not a value of the status column: it is one of the computed filters below.
    if (status && status !== ATTENTION) query = query.eq("status", status);
    if (city) query = query.eq("city", city);
    // Needs attention, the balance band and the health band are worked out in
    // the database, over every shop, before the list is cut into pages.
    for (const [column, operator, value] of computedShopFilters({ status, balance, health })) {
      query = query.filter(column, operator, value);
    }

    if (search) query = query.or(merchantSearchFilter(search));

    if (days.gte) query = query.gte("created_at", days.gte);
    if (days.lt) query = query.lt("created_at", days.lt);

    // ── Multi-column sort ──────────────────────────────────────────────
    // Empty values (a shop with no wallet or no city) go last either way.
    for (const { column, ascending } of sort) {
      query = query.order(column, { ascending, nullsFirst: false });
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
    const merchants = tenants.map(({ staff_shop_tags: staffTags, ...tenant }) => {
      const row = stats.get(tenant.id);
      if (!row) throw new Error(`No list numbers for shop ${tenant.id}`);

      return {
        ...tenant,
        // One row per shop, so the API gives an object, or null for a shop never tagged.
        tags: staffTags?.tags ?? [],
        // The later of the last wallet line and the last real order.
        last_active_at: laterOf(row.last_wallet_at, row.last_order_at),
        // Our fees (monthly fee, delivered orders, messages), not every wallet charge.
        fees_30d: row.fees_30d,
        fees_today: row.fees_today,
        orders_30d: row.orders_30d,
        // Active members today. The usage row's team number below is written once, at sign-up.
        team_members: row.team_members,
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
