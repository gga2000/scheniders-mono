/**
 * The month a usage row belongs to. The database keys `usage_tracking` rows by
 * the UTC year and month, so "this month's row" is the UTC month, on the
 * server and in the browser alike, whatever time zone either runs in.
 */
export function usageMonthNow(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}
