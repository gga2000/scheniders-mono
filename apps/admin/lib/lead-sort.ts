/*
 * The orders the leads list offers. The sort menu shows these, and the API
 * orders by nothing else: it used to pass any "sort" value to the database,
 * so a value that is not a column failed the whole list. No imports: the
 * browser and the API route both read this one list.
 */

export const LEAD_SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest" },
  { value: "lead_score:desc", label: "Highest score" },
  { value: "follower_count:desc", label: "Most followers" },
  { value: "estimated_daily_orders:desc", label: "Most est. orders" },
  { value: "merchant_name:asc", label: "Name (A–Z)" },
] as const;

export const DEFAULT_LEAD_SORT = LEAD_SORT_OPTIONS[0].value;

export interface LeadOrder {
  column: string;
  ascending: boolean;
}

/**
 * The `sort` value of a leads request as the columns to order by, or why it
 * cannot be read. Many leads share a score, so the list then orders by id:
 * without it, two pages can show the same lead and skip another.
 */
export function readLeadSort(param: string): LeadOrder[] | { error: string } {
  if (!LEAD_SORT_OPTIONS.some((option) => option.value === param)) {
    return { error: `The leads list cannot be sorted by "${param}"` };
  }
  const [column = "", direction] = param.split(":");
  return [
    { column, ascending: direction === "asc" },
    { column: "id", ascending: true },
  ];
}
