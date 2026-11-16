import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { fetchMerchantListStats } from "@/lib/console-stats";
import {
  DEFAULT_LIST_SORT,
  LIST_SORTS,
  isListSort,
  isMerchantTab,
  tabFilters,
  type MerchantListRow,
} from "@/lib/merchant-list";
import { merchantSearchFilter } from "@/lib/merchant-search";

/** What the table shows of a shop, read in one go. */
const COLUMNS =
  "id, display_id, business_name, slug, city, contact_phone, status, plan, trial_ends_at, restrictions, staff_wallet_balance, subscriptions(status, current_period_end, auto_renew)";

const subscriptionSchema = z.object({
  status: z.string(),
  current_period_end: z.string(),
  auto_renew: z.boolean().nullable(),
});

/** A shop as the read answers; the database is a boundary like any other. */
const shopReadSchema = z.object({
  id: z.string(),
  display_id: z.number().nullable(),
  business_name: z.string(),
  slug: z.string(),
  city: z.string().nullable(),
  contact_phone: z.string().nullable(),
  status: z.string(),
  plan: z.string(),
  trial_ends_at: z.string().nullable(),
  restrictions: z.object({ paused_until: z.string().nullable().optional() }).nullable(),
  // numeric comes back as a number or, past the safe range, as a string.
  staff_wallet_balance: z.union([z.number(), z.string()]).nullable(),
  subscriptions: z.array(subscriptionSchema).nullable(),
});
type ShopRead = z.infer<typeof shopReadSchema>;

/**
 * The Merchants list, one page at a time (board s1): a tab, a search and a
 * sort, all applied by the database over every shop before the list is cut
 * into pages.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = request.nextUrl;
  const tabParam = searchParams.get("tab") ?? "all";
  if (!isMerchantTab(tabParam)) return NextResponse.json({ error: `There is no "${tabParam}" tab` }, { status: 400 });
  const sortParam = searchParams.get("sort") ?? DEFAULT_LIST_SORT;
  if (!isListSort(sortParam)) return NextResponse.json({ error: `The list cannot be sorted by "${sortParam}"` }, { status: 400 });
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, Math.floor(Number(searchParams.get("page") ?? "1")) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get("limit") ?? "50")) || 50));

  try {
    const supabase = createAdminClient();
    // The demo store (Fermi B13) has its own card, not a row among customers.
    let query = supabase.from("tenants").select(COLUMNS, { count: "exact" }).eq("is_demo", false);
    for (const [column, operator, value] of tabFilters(tabParam)) query = query.filter(column, operator, value);
    if (search) query = query.or(merchantSearchFilter(search));
    for (const { column, ascending } of LIST_SORTS[sortParam]) query = query.order(column, { ascending, nullsFirst: false });
    // Shops made in the same instant need a fixed order, or a page boundary can skip or repeat one.
    query = query.order("id", { ascending: true }).range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    const shops = z.array(shopReadSchema).parse(data ?? []);

    // Orders over 30 Baghdad days, the last order and the billing lock, counted
    // by the database (admin_merchant_list_stats). A failed read fails the
    // request; it never draws a busy shop as a quiet one.
    const stats = await fetchMerchantListStats(supabase, shops.map((shop) => shop.id));

    const merchants: MerchantListRow[] = shops.map((shop) => {
      const row = stats.get(shop.id);
      if (!row) throw new Error(`No list numbers for shop ${shop.id}`);
      return {
        id: shop.id,
        display_id: shop.display_id,
        business_name: shop.business_name,
        slug: shop.slug,
        city: shop.city,
        contact_phone: shop.contact_phone,
        status: shop.status,
        plan: shop.plan,
        trial_ends_at: shop.trial_ends_at,
        restrictions: shop.restrictions,
        wallet_iqd: Number(shop.staff_wallet_balance ?? 0),
        subscription: newestSubscription(shop.subscriptions),
        billing_lock: row.lock_reason ? { reason: row.lock_reason, since: row.lock_since } : null,
        orders_30d: row.orders_30d,
        last_order_at: row.last_order_at,
      };
    });

    return NextResponse.json({ merchants, total: count ?? 0, page, limit });
  } catch (error) {
    console.error("Merchants API error:", error);
    return NextResponse.json({ error: "Could not load the merchants." }, { status: 500 });
  }
}

/** A shop may carry an old subscription beside its current one; the one that runs latest is the one that counts. */
function newestSubscription(rows: ShopRead["subscriptions"]): MerchantListRow["subscription"] {
  let newest: MerchantListRow["subscription"] = null;
  for (const row of rows ?? []) {
    if (!newest || Date.parse(row.current_period_end) > Date.parse(newest.current_period_end)) newest = row;
  }
  return newest;
}
