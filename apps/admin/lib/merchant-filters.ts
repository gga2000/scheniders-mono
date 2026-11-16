/*
 * The Merchants list's three filters that are not a column of the shop:
 * "Needs attention", the wallet balance bands and the health bands. Each is a
 * database function over the shop row (migration staff_list_filters), which
 * the API filters like a column. So the filter runs over every shop before the
 * list is cut into pages, and the list and the numbers above it cannot disagree.
 */

export type ShopFilter = [column: string, operator: "eq" | "lt" | "lte" | "gt" | "gte", value: number | boolean];

const BALANCE_BANDS = new Map<string, ShopFilter[]>([
  ["critical", [["staff_wallet_balance", "lt", 10_000]]],
  [
    "low",
    [
      ["staff_wallet_balance", "gte", 10_000],
      ["staff_wallet_balance", "lte", 50_000],
    ],
  ],
  ["healthy", [["staff_wallet_balance", "gt", 50_000]]],
]);

/** A health score under this is "at risk"; from the next line up it is "healthy". The chip colours use the same two lines. */
export const HEALTH_AT_RISK_BELOW = 40;
export const HEALTH_HEALTHY_FROM = 70;

const HEALTH_BANDS = new Map<string, ShopFilter[]>([
  ["at_risk", [["staff_health_score", "lt", HEALTH_AT_RISK_BELOW]]],
  [
    "warning",
    [
      ["staff_health_score", "gte", HEALTH_AT_RISK_BELOW],
      ["staff_health_score", "lt", HEALTH_HEALTHY_FROM],
    ],
  ],
  ["healthy", [["staff_health_score", "gte", HEALTH_HEALTHY_FROM]]],
]);

/** "attention" is a filter of its own, not a value of the status column. */
export const ATTENTION = "attention";

/**
 * A wallet under this many IQD puts a shop on the "Needs attention" list. The
 * database decides who is on that list (staff_needs_attention, migration
 * staff_list_filters); this copy only lets the numbers above the list say how
 * many shops are there for that reason. It is not the "critical" balance band
 * above, which is under 10,000 IQD.
 */
export const ATTENTION_WALLET_IQD = 5_000;

/**
 * The filters to put on a read of `tenants` for these query values. A band
 * name the console does not use adds no filter, as before.
 */
export function computedShopFilters(asked: {
  status?: string | null;
  balance?: string | null;
  health?: string | null;
}): ShopFilter[] {
  return [
    ...(asked.status === ATTENTION ? ([["staff_needs_attention", "eq", true]] satisfies ShopFilter[]) : []),
    ...(BALANCE_BANDS.get(asked.balance ?? "") ?? []),
    ...(HEALTH_BANDS.get(asked.health ?? "") ?? []),
  ];
}
