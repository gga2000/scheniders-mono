/*
 * Which actions the shop page offers, for this shop and this staff member.
 *
 * The page showed Top Up, Change Plan and Suspend to everyone, and support
 * staff got "Forbidden" on click. Now a button shows only when the database
 * would accept it from this login: Add money first, Give free days beside it,
 * the rest under More. The API routes check the same permissions again.
 */
import type { AdminAction } from "@/types/admin";

export interface ShopFacts {
  /** The tenant's status as the record read returns it: trial, active, limited, suspended, cancelled. */
  status: string;
  /** The billing lock holds the shop (its status still reads trial or active). */
  locked: boolean;
  /** The subscription is trialing, active or past due, so it has a month to extend. */
  subscriptionRunning: boolean;
}

export type Can = (action: AdminAction) => boolean;

/** A subscription in these states still has a month that renews (or failed to). */
const RUNNING = new Set(["trialing", "active", "past_due"]);

export function isSubscriptionRunning(status: string | null | undefined): boolean {
  return !!status && RUNNING.has(status);
}

/** Free days lengthen the trial of a shop on trial, or the month of a paying shop. */
export type FreeDaysKind = "trial" | "month";

export function freeDaysKind(shop: ShopFacts, can: Can): FreeDaysKind | null {
  if (shop.status === "trial") return can("extend_trial") ? "trial" : null;
  if (shop.status === "active" && shop.subscriptionRunning) return can("manage_subscription") ? "month" : null;
  return null;
}

export type MoreAction = "orders" | "plan" | "pause" | "hold" | "reactivate" | "convert" | "note";

/** The More menu, in the order staff reach for them. */
export function moreActions(shop: ShopFacts, can: Can): MoreAction[] {
  const stopped = shop.status === "suspended" || shop.status === "cancelled";
  const items: Array<[MoreAction, boolean]> = [
    // The lock card says who may give more orders for which lock.
    ["orders", shop.locked],
    ["plan", can("change_plan")],
    ["pause", can("suspend_tenant") && !stopped && shop.status !== "limited"],
    ["hold", can("suspend_tenant") && !stopped],
    ["reactivate", can("reactivate_tenant") && shop.status === "suspended"],
    ["convert", can("manage_subscription") && shop.status === "trial"],
    ["note", can("add_note")],
  ];
  return items.filter(([, shown]) => shown).map(([action]) => action);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where `days` more end: counted from the current end, or from now when that
 * end has passed (or there is none). admin_extend_trial and
 * admin_extend_subscription count the same way, so the preview matches what
 * the database writes.
 */
export function endAfterDays(end: string | null, days: number, now: Date = new Date()): Date {
  const from = Math.max(end ? new Date(end).getTime() : 0, now.getTime());
  return new Date(from + days * DAY_MS);
}

/** A whole number of IQD typed by staff ("10,000" or "10000"), or null. */
export function typedAmount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
