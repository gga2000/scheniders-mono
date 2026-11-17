import { z } from "zod";
import { dayOf, TRIAL_ENDING_DAYS, trialClock } from "./baghdad-day";
import { lockedBecause } from "./billing-lock-label";
import { formatUntilDay } from "./format";
import { pauseLiftOverdue } from "./tenant-pause";

/**
 * "Check this shop" beside a support conversation. `support_shop_check`
 * gathers the facts in one call; this file decides what is fine, worth a
 * look or broken, and says it in one short line each.
 */

const ts = z.string().nullable();
const n = z.number();

export const ShopCheckSchema = z.object({
  store: z.object({
    status: z.string(),
    is_prospect: z.boolean(),
    is_demo: z.boolean(),
    paused: z.boolean(),
    blocks_new_orders: z.boolean(),
    paused_until: ts,
    pause_reason: ts,
    lock_reason: ts,
    lock_since: ts,
    trial_ends_at: ts,
  }),
  products: z.object({ on_store: n, sold_out_marked: n, no_stock: n }),
  waseet: z.object({ calls_7d: n, failed_7d: n, last_error: ts, last_error_at: ts }),
  prime: z.object({ is_active: z.boolean(), last_synced_at: ts, last_error: ts }).nullable(),
  whatsapp: z.object({
    paused: z.boolean(),
    pause_reason: ts,
    paused_at: ts,
    sent_7d: n,
    delivered_7d: n,
    failed_7d: n,
  }),
  wallet: z.object({ balance_iqd: n, threshold_iqd: n }).nullable(),
  orders: z.object({ last_at: ts, last_7d: n }),
  errors: z.object({ count_7d: n, last_message: ts, last_path: ts, last_at: ts }),
  checked_at: z.string(),
});

export type ShopCheck = z.infer<typeof ShopCheckSchema>;

export type CheckState = "ok" | "look" | "broken" | "none";

export interface CheckLine {
  key: "store" | "products" | "delivery" | "prime" | "whatsapp" | "wallet" | "orders" | "errors";
  label: string;
  state: CheckState;
  text: string;
  /** Where staff go to look or fix it. */
  href?: string;
}

/** The staff console's low-wallet line (same as "needs attention"). */
const LOW_WALLET_IQD = 5_000;
/** A shop that usually sells and has been quiet this long is worth a look. */
const QUIET_DAYS = 3;
/** WhatsApp failures above this share of sends (with at least 10 sends) need a look. */
const WHATSAPP_FAIL_SHARE = 0.2;

const DAY_MS = 86_400_000;

const iqd = (amount: number) => `${new Intl.NumberFormat("en-IQ").format(Math.round(amount))} IQD`;

/**
 * "today", "yesterday", "3 days ago" on the Baghdad calendar, the days the
 * shop page dates things by: a lock from 23:00 last night is "yesterday" at
 * 10:00, not "today". "tomorrow" or "in 2 days" for the future.
 */
export function daysAgo(iso: string, nowMs: number): string {
  const days = Math.round((Date.parse(dayOf(nowMs)) - Date.parse(dayOf(iso))) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  return days > 0 ? `${days} days ago` : `in ${-days} days`;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function storeLine(c: ShopCheck, tenantId: string, nowMs: number): CheckLine {
  const s = c.store;
  const base = { key: "store", label: "Store", href: `/merchants/${tenantId}` } as const;
  if (s.status === "cancelled") return { ...base, state: "broken", text: "Cancelled. The store page is gone." };
  if (s.status === "suspended") return { ...base, state: "broken", text: "Suspended. The store takes no orders." };
  if (s.lock_reason) {
    const since = s.lock_since ? ` since ${daysAgo(s.lock_since, nowMs)}` : "";
    return { ...base, state: "broken", text: `${lockedBecause(s.lock_reason, since)}.` };
  }
  // A pause past its end date stops nothing, and the hourly lift takes it off
  // within the hour. Past that the lift failed for this shop, and a super admin
  // (the one role that may lift pauses) lifts it by hand. The shop page's Paused
  // banner says the same.
  if (s.paused && s.paused_until && Date.parse(s.paused_until) <= nowMs) {
    const overdue = pauseLiftOverdue(s.paused_until, nowMs);
    return {
      ...base,
      state: overdue ? "look" : "ok",
      text: overdue
        ? `Pause ended ${daysAgo(s.paused_until, nowMs)} but did not lift on its own. Nothing is stopped now. A super admin can lift it on the shop page.`
        : `Pause ended ${daysAgo(s.paused_until, nowMs)}. Nothing is stopped now; it lifts on its own within the hour.`,
    };
  }
  if (s.paused && s.blocks_new_orders) {
    return {
      ...base,
      state: "broken",
      text: `Paused by staff, new orders blocked${s.pause_reason ? `: ${s.pause_reason}` : "."}`,
    };
  }
  if (s.paused) return { ...base, state: "look", text: "Paused by staff. Orders still come in." };
  if (s.is_prospect) return { ...base, state: "look", text: "Prospect store: built by us, takes no orders yet." };
  if (s.status === "trial" && s.trial_ends_at) {
    // Days on the Baghdad calendar, as Trials and the shop page count them.
    const clock = trialClock(s.trial_ends_at, nowMs);
    if (clock.ended) {
      const when = clock.days === 0 ? "today" : clock.days === -1 ? "yesterday" : `${-clock.days} days ago`;
      return { ...base, state: "look", text: `Trial ended ${when}, not paid yet.` };
    }
    return {
      ...base,
      state: clock.days <= TRIAL_ENDING_DAYS ? "look" : "ok",
      text: `Taking orders. Trial ends ${formatUntilDay(s.trial_ends_at, new Date(nowMs))}.`,
    };
  }
  return { ...base, state: "ok", text: "Open and taking orders." };
}

function productsLine(c: ShopCheck): CheckLine {
  const p = c.products;
  const base = { key: "products", label: "Products" } as const;
  if (p.on_store === 0) return { ...base, state: "broken", text: "Nothing on the store. Customers see an empty shop." };
  const notes = [
    p.no_stock > 0 ? `${plural(p.no_stock, "product")} with no stock left` : null,
    p.sold_out_marked > 0 ? `${p.sold_out_marked} marked sold out` : null,
  ].filter(Boolean);
  return {
    ...base,
    state: p.no_stock > 0 ? "look" : "ok",
    text: `${plural(p.on_store, "product")} on the store${notes.length ? `; ${notes.join(", ")}` : ""}.`,
  };
}

function deliveryLine(c: ShopCheck, nowMs: number): CheckLine {
  const w = c.waseet;
  const base = { key: "delivery", label: "Al-Waseet" } as const;
  if (w.calls_7d === 0) return { ...base, state: "none", text: "No sends to Al-Waseet in 7 days." };
  if (w.failed_7d === 0) return { ...base, state: "ok", text: `${plural(w.calls_7d, "call")} in 7 days, none failed.` };
  const when = w.last_error_at ? `, newest ${daysAgo(w.last_error_at, nowMs)}` : "";
  return {
    ...base,
    state: w.failed_7d === w.calls_7d ? "broken" : "look",
    text: `${w.failed_7d} of ${w.calls_7d} calls failed in 7 days${when}${w.last_error ? `: ${w.last_error}` : "."}`,
  };
}

function primeLine(c: ShopCheck, nowMs: number): CheckLine {
  const base = { key: "prime", label: "Prime" } as const;
  if (!c.prime) return { ...base, state: "none", text: "Not linked." };
  if (!c.prime.is_active) return { ...base, state: "broken", text: "Linked but switched off." };
  if (c.prime.last_error) return { ...base, state: "broken", text: `Last sync failed: ${c.prime.last_error}` };
  return {
    ...base,
    state: "ok",
    text: c.prime.last_synced_at ? `Linked, last sync ${daysAgo(c.prime.last_synced_at, nowMs)}.` : "Linked, not synced yet.",
  };
}

function whatsappLine(c: ShopCheck, nowMs: number): CheckLine {
  const w = c.whatsapp;
  const base = { key: "whatsapp", label: "WhatsApp", href: "/whatsapp" } as const;
  if (w.paused) {
    const since = w.paused_at ? ` ${daysAgo(w.paused_at, nowMs)}` : "";
    return {
      ...base,
      state: "broken",
      text: `Sending paused${since}${w.pause_reason ? ` (${w.pause_reason.replace(/_/g, " ")})` : ""}.`,
    };
  }
  if (w.sent_7d === 0) return { ...base, state: "none", text: "No messages sent in 7 days." };
  const failing = w.sent_7d >= 10 && w.failed_7d / w.sent_7d > WHATSAPP_FAIL_SHARE;
  return {
    ...base,
    state: failing ? "look" : "ok",
    text: `${w.sent_7d} sent in 7 days, ${w.delivered_7d} delivered, ${w.failed_7d} failed.`,
  };
}

function walletLine(c: ShopCheck, tenantId: string): CheckLine {
  const base = { key: "wallet", label: "Wallet", href: `/merchants/${tenantId}` } as const;
  if (!c.wallet) return { ...base, state: "look", text: "No wallet yet." };
  const { balance_iqd: balance } = c.wallet;
  if (balance <= 0) return { ...base, state: "broken", text: `${iqd(balance)}. Fees and messages cannot be paid.` };
  if (balance < LOW_WALLET_IQD) return { ...base, state: "look", text: `${iqd(balance)}, running low.` };
  return { ...base, state: "ok", text: iqd(balance) };
}

function ordersLine(c: ShopCheck, nowMs: number): CheckLine {
  const o = c.orders;
  const base = { key: "orders", label: "Orders" } as const;
  if (!o.last_at) return { ...base, state: "none", text: "No real order yet." };
  const quiet = nowMs - Date.parse(o.last_at) > QUIET_DAYS * DAY_MS;
  return {
    ...base,
    state: quiet ? "look" : "ok",
    text: `Newest ${daysAgo(o.last_at, nowMs)}; ${plural(o.last_7d, "order")} in 7 days.`,
  };
}

function errorsLine(c: ShopCheck, tenantId: string, nowMs: number): CheckLine {
  const e = c.errors;
  const href = `https://schneiders.sentry.io/issues/?query=tenant_id%3A${tenantId}&statsPeriod=7d`;
  const base = { key: "errors", label: "Errors", href } as const;
  if (e.count_7d === 0) return { ...base, state: "ok", text: "No errors sent to us in 7 days. Sentry has the full list." };
  const when = e.last_at ? ` ${daysAgo(e.last_at, nowMs)}` : "";
  const where = e.last_path ? ` on ${e.last_path}` : "";
  return {
    ...base,
    state: "look",
    text: `${plural(e.count_7d, "error")} sent with messages in 7 days. Newest${when}${where}: ${e.last_message ?? "no text"}`,
  };
}

/** The check, one line per part, in the order staff read it. */
export function shopCheckLines(check: ShopCheck, tenantId: string, nowMs: number = Date.now()): CheckLine[] {
  return [
    storeLine(check, tenantId, nowMs),
    ordersLine(check, nowMs),
    productsLine(check),
    walletLine(check, tenantId),
    whatsappLine(check, nowMs),
    deliveryLine(check, nowMs),
    primeLine(check, nowMs),
    errorsLine(check, tenantId, nowMs),
  ];
}
