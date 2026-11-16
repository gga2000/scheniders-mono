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

const HEALTH_BANDS = new Map<string, ShopFilter[]>([
  ["at_risk", [["staff_health_score", "lt", 40]]],
  [
    "warning",
    [
      ["staff_health_score", "gte", 40],
      ["staff_health_score", "lt", 70],
    ],
  ],
  ["healthy", [["staff_health_score", "gte", 70]]],
]);

/** "attention" is a filter of its own, not a value of the status column. */
export const ATTENTION = "attention";

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
