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
  /**
   * The demo store (tenants.is_demo): it is never charged, paused or put on
   * hold, so the database refuses free days, pause and hold for it
   * (admin_extend_subscription, pause_tenant, admin_update_shop).
   */
  demo: boolean;
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
  if (shop.demo) return null;
  if (shop.status === "trial") return can("extend_trial") ? "trial" : null;
  if (shop.status === "active" && shop.subscriptionRunning) return can("manage_subscription") ? "month" : null;
  return null;
}

export type MoreAction = "orders" | "plan" | "pause" | "hold" | "reactivate" | "convert" | "note";

/** The More menu, in the order staff reach for them. */
export function moreActions(shop: ShopFacts, can: Can): MoreAction[] {
  const stopped = shop.status === "suspended" || shop.status === "cancelled";
  // The demo store's status never changes, so pause and hold could only be refused.
  const canStop = can("suspend_tenant") && !shop.demo && !stopped;
  const items: Array<[MoreAction, boolean]> = [
    // The lock card says who may give more orders for which lock.
    ["orders", shop.locked],
    ["plan", can("change_plan")],
    // A paused shop keeps its status until the pause is lifted: the database
    // refuses a second pause and a hold over it (paused).
    ["pause", canStop && shop.status !== "limited"],
    ["hold", canStop && shop.status !== "limited"],
    ["reactivate", can("reactivate_tenant") && shop.status === "suspended"],
    ["convert", can("manage_subscription") && shop.status === "trial"],
    ["note", can("add_note")],
  ];
  return items.filter(([, shown]) => shown).map(([action]) => action);
}

/**
 * What a shop on hold comes back as when reactivated. A trial that was never
 * paid comes back as a trial (admin_update_shop). Any other shop comes back
 * active; one whose last month is unpaid (its subscription past_due) is locked
 * again at once by tenant_billing_lock, until its wallet covers the month.
 * The internal plan never locks.
 */
export type Comeback = "trial" | "active" | "active_unpaid";

export function reactivateComeback(neverPaid: boolean, subscriptionStatus: string | null | undefined, plan: string | null): Comeback {
  if (neverPaid) return "trial";
  return subscriptionStatus === "past_due" && plan !== "internal" ? "active_unpaid" : "active";
}

/** What Reactivate does to a shop on hold, said before it is pressed. */
export function reactivateWords(comeback: Comeback, trialEndsAt: string | null, now: Date): string {
  if (comeback === "active") return "The shop is active again now, and its monthly fee is charged as usual.";
  if (comeback === "active_unpaid") {
    return "The shop is active again now, but its last month is not paid, so it stays locked until its wallet covers the month.";
  }
  const ended = trialEndsAt !== null && Date.parse(trialEndsAt) <= now.getTime();
  return ended
    ? "The shop goes back to its trial now. Its trial ended unpaid, so it stays locked until it pays."
    : "The shop goes back to its trial now: its trial was never paid.";
}

/**
 * The renewal line on the shop page. renew_subscription_core charges only a
 * shop on trial or active: one paused, on hold or cancelled answers on_hold
 * and is not charged, so "charges the wallet each month" would say otherwise.
 * The demo store renews each month at no charge.
 */
export function renewalWords(autoRenew: boolean, demo: boolean, status: string): string {
  if (!autoRenew) return "Off: the month ends and is not renewed";
  if (demo) return "On: renews each month, never charged (demo store)";
  switch (status) {
    case "limited":
      return "On: not charged while paused, then charges the wallet each month";
    case "suspended":
      return "On: not charged while on hold, then charges the wallet each month";
    case "cancelled":
      return "On: not charged while cancelled";
    default:
      return "On: charges the wallet each month";
  }
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

/** The two shop page forms a link elsewhere can open: Add money and Give free days. */
export type ShopForm = "money" | "days";

const FORM_PARAM: Record<ShopForm, string> = { money: "add-money", days: "free-days" };

/**
 * A link that opens a shop's page with one of its forms ready. The card's
 * right-click menu and Shops at risk sent "/billing?topup=<id>" and
 * "?action=extend-trial", which nothing read: staff landed on Billing or the
 * shop page with no shop or no form, and had to find the shop again.
 */
export function shopFormHref(shopId: string, form: ShopForm): string {
  return `/merchants/${shopId}?action=${FORM_PARAM[form]}`;
}

/** The form a shop page link asks for. "extend-trial" is the menu's old word for free days. */
export function shopFormFrom(value: string | null): ShopForm | null {
  if (value === FORM_PARAM.money) return "money";
  if (value === FORM_PARAM.days || value === "extend-trial") return "days";
  return null;
}
