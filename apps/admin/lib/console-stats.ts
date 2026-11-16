import { z } from "zod";
import type { createAdminClient } from "./admin-supabase";

/*
 * The staff console's totals are counted in the database (migrations
 * 20261116013246 and 20261116033335), never from fetched rows: the API returns at most 1,000 rows,
 * so a row count in JavaScript stops being true at order 1,001. Each function
 * returns one JSON value, and the rules for "real order", "earned money",
 * "fees" and "day" are written once, in that migration.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

const num = z.number();
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthKey = z.string().regex(/^\d{4}-\d{2}$/);
/** One value per day, oldest first, ending today (Baghdad). */
const week = z.array(num).length(7);

export const dashboardStatsSchema = z.object({
  today: dayKey,
  orders: z.object({
    today: num,
    yesterday: num,
    last7: num,
    prev7: num,
    month: num,
    prevMonth: num,
    allTime: num,
    daily7: week,
  }),
  sales: z.object({
    month: num,
    prevMonth: num,
    last7: num,
    prev7: num,
    sum90: num,
    count90: num,
    daily7: week,
  }),
  delivery: z.object({ delivered: num, ended: num, prevDelivered: num, prevEnded: num }),
  statuses90: z.record(z.string(), num),
  shops: z.array(
    z.object({
      tenantId: z.string(),
      ordersAll: num,
      firstOrderAt: z.string(),
      orders90: num,
      sales90: num,
      daily7: week,
    }),
  ),
  governorates90: z.array(z.object({ code: z.string(), orders: num, sales: num })),
  cities90: z.array(z.object({ city: z.string(), sales: num })),
  sources90: z.array(z.object({ source: z.string(), sales: num })),
  hours90: z.array(z.object({ dow: num, hour: num, count: num })),
});

export const usageStatsSchema = z.object({
  today: dayKey,
  total: num,
  /** Days with at least one order; a missing day is zero. */
  days: z.record(z.string(), num),
  hours: z.array(num).length(24),
});

export const incomeStatsSchema = z.object({
  today: dayKey,
  /** Twelve Baghdad months, oldest first, ending with the current one. */
  monthly: z
    .array(z.object({ month: monthKey, subscription: num, orders: num, whatsapp: num, other: num }))
    .length(12),
  byPlan: z.array(z.object({ month: monthKey, plan: z.string(), amount: num })),
  byPlan90: z.array(z.object({ plan: z.string(), amount: num })),
  cohorts: z.array(z.object({ cohort: monthKey, tenants: num, months: z.array(num).length(6) })),
  byTenant: z.array(z.object({ tenantId: z.string(), amount: num })),
  feesDaily7: week,
  topups: z.object({
    daily7: week,
    byDow: z.array(z.object({ dow: num, count: num, total: num })).length(7),
  }),
});

const instant = z.string().min(1);

/** One shop on the Merchants list (migration 20261116033335). "Last 30 days" is today and the 29 Baghdad days before it. */
export const merchantListStatsSchema = z.array(
  z.object({
    tenant_id: z.string(),
    orders_30d: num,
    /** One value per day, oldest first, ending today (Baghdad). */
    order_sparkline: z.array(num).length(30),
    last_order_at: instant.nullable(),
    fees_30d: num,
    fees_today: num,
    last_wallet_at: instant.nullable(),
    usage_orders_count: num.nullable(),
    usage_orders_charged: num.nullable(),
    usage_team_members_count: num.nullable(),
    /** People who can sign in to the shop today (migration admin_merchant_list_team_count). */
    team_members: num,
    lock_reason: z.enum(["trial_ended", "unpaid"]).nullable(),
    lock_since: instant.nullable(),
  }),
);

/** One member of staff on the Team page. */
export const teamCountsSchema = z.array(
  z.object({
    user_id: z.string(),
    leads_added: num,
    leads_converted: num,
    stores_built: num,
    total_actions: num,
    commission_earned: num,
    commission_pending: num,
  }),
);

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type MerchantListStats = z.infer<typeof merchantListStatsSchema>[number];
export type TeamCounts = z.infer<typeof teamCountsSchema>[number];
export type UsageStats = z.infer<typeof usageStatsSchema>;
export type IncomeStats = z.infer<typeof incomeStatsSchema>;

/**
 * Call a stats function and check its answer. A database error or an answer in
 * the wrong shape throws: the caller answers 500 and the screen says it could
 * not load, instead of drawing zeros that look like a quiet day.
 */
async function readStats<T>(
  supabase: AdminClient,
  fn: string,
  args: Record<string, string | string[]>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") || "root";
    throw new Error(`${fn} returned an answer this app cannot read (at ${where})`);
  }
  return parsed.data;
}

export function fetchDashboardStats(supabase: AdminClient): Promise<DashboardStats> {
  return readStats(supabase, "admin_dashboard_stats", {}, dashboardStatsSchema);
}

/** Orders per Baghdad day and hour over the last 365 days, for one shop or (null) all of them. */
export function fetchUsageStats(supabase: AdminClient, tenantId: string | null): Promise<UsageStats> {
  return readStats(supabase, "admin_usage_stats", tenantId ? { _tenant_id: tenantId } : {}, usageStatsSchema);
}

export function fetchIncomeStats(supabase: AdminClient): Promise<IncomeStats> {
  return readStats(supabase, "admin_income_stats", {}, incomeStatsSchema);
}

/**
 * The Merchants list numbers for the shops on one page, keyed by shop.
 *
 * A function that returns rows is cut at 1,000 rows by the API like any table,
 * so this is for a page of shops, never for all of them. A shop that was asked
 * for and did not come back throws, so a cut answer cannot pass as zeros.
 */
export async function fetchMerchantListStats(
  supabase: AdminClient,
  tenantIds: string[],
): Promise<Map<string, MerchantListStats>> {
  const ids = [...new Set(tenantIds)];
  if (ids.length === 0) return new Map();
  const rows = await readStats(supabase, "admin_merchant_list_stats", { _tenant_ids: ids }, merchantListStatsSchema);
  const byShop = new Map(rows.map((row) => [row.tenant_id, row]));
  const missing = ids.filter((id) => !byShop.has(id)).length;
  if (missing > 0) throw new Error(`admin_merchant_list_stats left out ${missing} of ${ids.length} shops`);
  return byShop;
}

/** Our fees from a set of shops over the last 30 Baghdad days, as one number, so it holds for any number of shops. */
export function fetchFees30d(supabase: AdminClient, tenantIds: string[]): Promise<number> {
  return readStats(supabase, "admin_fees_30d", { _tenant_ids: tenantIds }, num);
}

/** Leads, actions and commissions per member of staff, keyed by user. */
export async function fetchTeamCounts(supabase: AdminClient): Promise<Map<string, TeamCounts>> {
  const rows = await readStats(supabase, "admin_team_counts", {}, teamCountsSchema);
  return new Map(rows.map((row) => [row.user_id, row]));
}

/** What we sell: the monthly fee, the delivered-order fee and paid messages. "Other" charges are corrections, not income. */
export function feesOf(month: { subscription: number; orders: number; whatsapp: number }): number {
  return month.subscription + month.orders + month.whatsapp;
}

/*
 * Calendar arithmetic on the 'YYYY-MM-DD' keys the database returns. "Today"
 * comes from the database's Baghdad clock, so these never read this server's
 * clock or time zone.
 */

/** The day `n` days after `day` (before, when negative). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** The `count` days ending on `today`, oldest first. */
export function daysEnding(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)));
}

const baghdadMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit" });

/** The Baghdad month an instant falls in, as '2026-11'. 00:30 on the 1st in Baghdad is still the month before in UTC. */
export function monthOf(instant: string | Date): string {
  return baghdadMonth.format(new Date(instant));
}

/** The `count` months ending on `month`, oldest first. */
export function monthsEnding(month: string, count: number): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, monthNumber - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** '2026-11' reads "Nov 26". */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
