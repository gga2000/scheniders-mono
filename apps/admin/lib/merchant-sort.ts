/*
 * What the merchant list can be sorted by. The table and the sheet name a
 * column ("balance"), the database orders on its own name for it
 * ("wallet(balance_iqd)"). The list read used to pass the screen's name
 * straight to the database, so a click on Business, Balance, Health, Orders
 * or Revenue made the whole list fail to load. No imports: the browser and
 * the API route both read this one map.
 */

const SORT_COLUMNS = {
  business: "business_name",
  slug: "slug",
  plan: "plan",
  status: "status",
  city: "city",
  email: "contact_email",
  phone: "contact_phone",
  balance: "wallet(balance_iqd)",
  charged: "wallet(total_charged_iqd)",
  topped_up: "wallet(total_topped_up_iqd)",
  health: "staff_health_score",
  created: "created_at",
  created_at: "created_at",
} as const;

export type MerchantSortColumn = keyof typeof SORT_COLUMNS;

/**
 * Whether a column of the list can be sorted. Orders, fees, last active and
 * team are counted for each page after it is read, so the database cannot
 * order every shop by them; their headers do not sort.
 */
export function isSortableMerchantColumn(column: string): column is MerchantSortColumn {
  return Object.hasOwn(SORT_COLUMNS, column);
}

export interface MerchantOrder {
  column: string;
  ascending: boolean;
}

/** The list's default: newest shops first. */
export const DEFAULT_MERCHANT_SORT = "created_at:desc";

/**
 * The `sort` value of a list request ("balance:desc,plan:asc") as the
 * database columns to order by, or why it cannot be read.
 */
export function readMerchantSort(param: string): MerchantOrder[] | { error: string } {
  const orders: MerchantOrder[] = [];
  for (const part of param.split(",").filter(Boolean)) {
    const [column = "", direction = ""] = part.split(":");
    if (!isSortableMerchantColumn(column)) return { error: `The list cannot be sorted by "${column}"` };
    if (direction !== "asc" && direction !== "desc") return { error: `Sort direction must be asc or desc, not "${direction}"` };
    orders.push({ column: SORT_COLUMNS[column], ascending: direction === "asc" });
  }
  return orders;
}
