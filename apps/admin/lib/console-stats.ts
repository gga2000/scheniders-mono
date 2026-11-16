import { z } from "zod";
import type { createAdminClient } from "./admin-supabase";

/*
 * The staff console's totals are counted in the database (migration
 * 20261116013246), never from fetched rows: the API returns at most 1,000 rows,
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

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
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
  args: Record<string, string>,
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

/** '2026-11' reads "Nov 26". */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
