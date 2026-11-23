import { DEFAULT_MERCHANT_SORT } from "./merchant-sort";

/**
 * The Merchants filters as the list, its numbers and the server render ask
 * for them. One place, so the page's server read lands under the very key
 * the browser reads.
 */
export interface MerchantFilters {
  planFilter: string | null;
  statusFilter: string | null;
  cityFilter: string | null;
  balanceFilter: string | null;
  healthFilter: string | null;
  searchQuery: string;
  dateRange: { from: string | null; to: string | null };
}

/** What Merchants opens with: no filter, the default order (store/use-admin-store). */
export const NO_MERCHANT_FILTERS: MerchantFilters = {
  planFilter: null,
  statusFilter: null,
  cityFilter: null,
  balanceFilter: null,
  healthFilter: null,
  searchQuery: "",
  dateRange: { from: null, to: null },
};

export const MERCHANTS_PAGE_SIZE = 50;

/** The filter part of both reads' query values. */
function filterParams(f: MerchantFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.planFilter) params.set("plan", f.planFilter);
  // "attention" is resolved server-side via id allowlist (see API route)
  if (f.statusFilter) params.set("status", f.statusFilter);
  if (f.cityFilter) params.set("city", f.cityFilter);
  if (f.balanceFilter) params.set("balance", f.balanceFilter);
  if (f.healthFilter) params.set("health", f.healthFilter);
  // The server searches every shop, by name, slug, email or shop number.
  if (f.searchQuery) params.set("search", f.searchQuery);
  if (f.dateRange.from) params.set("date_from", f.dateRange.from);
  if (f.dateRange.to) params.set("date_to", f.dateRange.to);
  return params;
}

/** The list's sort value: the store keeps only columns the database can order every shop by. */
export function merchantSortParam(sortConfig: readonly { column: string; direction: string }[]): string {
  return sortConfig.length > 0 ? sortConfig.map((s) => `${s.column}:${s.direction}`).join(",") : DEFAULT_MERCHANT_SORT;
}

function pick(f: MerchantFilters): MerchantFilters {
  const { planFilter, statusFilter, cityFilter, balanceFilter, healthFilter, searchQuery, dateRange } = f;
  return { planFilter, statusFilter, cityFilter, balanceFilter, healthFilter, searchQuery, dateRange };
}

export function merchantsListKey(f: MerchantFilters, limit: number, sortParam: string) {
  return ["admin", "merchants", "infinite", { limit, ...pick(f), sortParam }] as const;
}

export function merchantsListParams(f: MerchantFilters, page: number, limit: number, sortParam: string): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), sort: sortParam, include_sparkline: "true" });
  for (const [name, value] of filterParams(f)) params.set(name, value);
  return params;
}

/** `f.statusFilter` here is the one the numbers count by (null when they ignore it). */
export function merchantsStatsKey(f: MerchantFilters) {
  return ["admin", "merchants", "stats", pick(f)] as const;
}

export function merchantsStatsParams(f: MerchantFilters): URLSearchParams {
  return filterParams(f);
}
