/*
 * The Merchants list (board s1, s2): one table in place of five views, and
 * tabs that carry their counts. The tabs, the row the API sends and the short
 * status reason live here, so the API route and the page read one map.
 */
import type { ListBillingLock } from "@/lib/billing-lock-label";
import type { ShopTone } from "@/lib/shop-status";
import { isSubscriptionRunning } from "@/lib/shop-actions";
import { formatDay } from "@/lib/format";

export const MERCHANT_TABS = ["all", "locked", "trial", "paying", "stopped", "cancelled", "internal"] as const;
export type MerchantTab = (typeof MERCHANT_TABS)[number];

export const TAB_LABEL: Record<MerchantTab, string> = {
  all: "All",
  locked: "Locked",
  trial: "Trial",
  paying: "Paying",
  stopped: "On hold",
  cancelled: "Cancelled",
  internal: "Internal",
};

export function isMerchantTab(value: string | null | undefined): value is MerchantTab {
  return !!value && (MERCHANT_TABS as readonly string[]).includes(value);
}

/** One PostgREST filter on a read of `tenants`, as `query.filter(column, operator, value)` takes it. */
export type TabFilter = [column: string, operator: "eq" | "neq" | "in" | "is", value: string];

/**
 * The filters a tab puts on a read of `tenants`. Our own shops have status
 * "active" but are never billed, so they sit under Internal, not Paying.
 * Locked reads the database's staff_locked, the rule the row's status words
 * use; a locked trial still shows under Trial too.
 */
export function tabFilters(tab: MerchantTab): TabFilter[] {
  switch (tab) {
    case "all":
      return [];
    case "locked":
      return [["staff_locked", "is", "true"]];
    case "trial":
      return [["status", "eq", "trial"], ["plan", "neq", "internal"]];
    case "paying":
      return [["status", "eq", "active"], ["plan", "neq", "internal"]];
    case "stopped":
      // On hold and paused: staff stopped the shop by hand.
      return [["status", "in", "(suspended,limited)"]];
    case "cancelled":
      return [["status", "eq", "cancelled"]];
    case "internal":
      return [["plan", "eq", "internal"]];
  }
}

/** The headers the list can be sorted by, and the database column for each. */
export const LIST_SORTS = {
  "created:desc": [{ column: "created_at", ascending: false }],
  "name:asc": [{ column: "business_name", ascending: true }],
  "name:desc": [{ column: "business_name", ascending: false }],
  "wallet:asc": [{ column: "staff_wallet_balance", ascending: true }],
  "wallet:desc": [{ column: "staff_wallet_balance", ascending: false }],
} as const satisfies Record<string, ReadonlyArray<{ column: string; ascending: boolean }>>;
export type ListSort = keyof typeof LIST_SORTS;
export const DEFAULT_LIST_SORT: ListSort = "created:desc";

export function isListSort(value: string | null | undefined): value is ListSort {
  return !!value && Object.hasOwn(LIST_SORTS, value);
}

/** One shop as the list API sends it: only what the table shows. */
export interface MerchantListRow {
  id: string;
  display_id: number | null;
  business_name: string;
  slug: string;
  city: string | null;
  contact_phone: string | null;
  status: string;
  plan: string;
  trial_ends_at: string | null;
  restrictions: { paused_until?: string | null } | null;
  wallet_iqd: number;
  /** The shop's newest subscription; a shop built from a lead may have none. */
  subscription: { status: string; current_period_end: string; auto_renew: boolean | null } | null;
  /** Set when the billing lock holds the shop; its status still reads "trial" or "active". */
  billing_lock: ListBillingLock | null;
  /** Real orders (no deleted, draft or test rows) over the last 30 Baghdad days. */
  orders_30d: number;
  last_order_at: string | null;
}

export interface ListStatus {
  tone: ShopTone;
  /** One or two words for the chip. */
  label: string;
  /** Why, or what comes next, in a few words. */
  reason: string;
}

/**
 * Where a shop in the list stands, in a chip and a few words: the same
 * reading as the shop page's status line, cut to fit one table cell.
 */
export function listStatus(row: MerchantListRow, now: Date = new Date()): ListStatus {
  const day = (value: string) => formatDay(value, now);

  if (row.billing_lock) {
    const since = row.billing_lock.since;
    const reason =
      row.billing_lock.reason === "trial_ended"
        ? since ? `trial ended ${day(since)}, not paid` : "trial ended, not paid"
        : since ? `not paid since ${day(since)}` : "month not paid";
    return { tone: "locked", label: "Locked", reason };
  }
  if (row.status === "limited") {
    const until = row.restrictions?.paused_until;
    return { tone: "paused", label: "Paused", reason: until ? `until ${day(until)}` : "no end date" };
  }
  if (row.status === "suspended") return { tone: "hold", label: "On hold", reason: "no monthly fee" };
  if (row.status === "cancelled") return { tone: "ended", label: "Cancelled", reason: "nothing is charged" };
  if (row.plan === "internal") return { tone: "internal", label: "Internal", reason: "no billing" };

  if (row.status === "trial") {
    const empty = row.wallet_iqd <= 0 ? ", wallet is empty" : "";
    return { tone: "trial", label: "Trial", reason: row.trial_ends_at ? `ends ${day(row.trial_ends_at)}${empty}` : `no end date${empty}` };
  }

  const sub = row.subscription;
  if (!sub || !isSubscriptionRunning(sub.status)) {
    return { tone: "ended", label: "Active", reason: "subscription ended, not billed" };
  }
  if (sub.status === "past_due") return { tone: "paying", label: "Behind", reason: "last month not paid yet" };
  if (sub.auto_renew === false) return { tone: "paying", label: "Paying", reason: `renewal off, ends ${day(sub.current_period_end)}` };
  return { tone: "paying", label: "Paying", reason: `renews ${day(sub.current_period_end)}` };
}
