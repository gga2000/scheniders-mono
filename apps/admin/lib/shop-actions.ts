/*
 * Which actions the shop page offers, for this shop and this staff member.
 *
 * The page showed Top Up, Change Plan and Suspend to everyone, and support
 * staff got "Forbidden" on click. Now a button shows only when the database
 * would accept it from this login: Add money first, Give free days beside it,
 * the rest under More. The API routes check the same permissions again.
 */
import type { AdminAction } from "@/types/admin";
import { formatDay, formatIQD } from "@/lib/format";
import { RENEWAL_STOP_WORDS, renewalOffOpens } from "@/lib/billing-lock-label";

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
  /**
   * A store built for a lead before the lead signs up (tenants.is_prospect).
   * Its trial is no merchant's: it is converted with the lead, so the
   * database refuses paid time on it (admin_convert_trial).
   */
  prospect: boolean;
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

/**
 * The name of the step that ends a trial with free time (convert-trial). The
 * More menu, the panel title and the refusal that points staff to it say it
 * from here, so the pointer cannot name a button that is no longer there.
 */
export const CONVERT_ACTION = "Start free time, no charge";

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
    // The database refuses paid time on the demo store and a lead's pre-built store.
    ["convert", can("manage_subscription") && shop.status === "trial" && !shop.demo && !shop.prospect],
    ["note", can("add_note")],
  ];
  return items.filter(([, shown]) => shown).map(([action]) => action);
}

/**
 * What a shop on hold comes back as when reactivated. A trial that was never
 * paid comes back as a trial (admin_update_shop). Any other shop comes back
 * active; one whose last month is unpaid (its subscription past_due) is locked
 * again at once by tenant_billing_lock, until its wallet covers the month.
 * With renewal off no money covers it: the month is not charged until the
 * shop pays on its lock screen or staff turn renewal on (round 20). The
 * internal plan never locks.
 */
export type Comeback = "trial" | "active" | "active_unpaid" | "active_renewal_off" | "active_unpaid_renewal_off";

export function reactivateComeback(
  neverPaid: boolean,
  subscriptionStatus: string | null | undefined,
  plan: string | null,
  renewalOff: boolean,
): Comeback {
  if (neverPaid) return "trial";
  if (plan === "internal") return "active";
  const unpaid = subscriptionStatus === "past_due";
  if (renewalOff) return unpaid ? "active_unpaid_renewal_off" : "active_renewal_off";
  return unpaid ? "active_unpaid" : "active";
}

/** What Reactivate does to a shop on hold, said before it is pressed. */
export function reactivateWords(comeback: Comeback, trialEndsAt: string | null, now: Date): string {
  switch (comeback) {
    case "active":
      return "The shop is active again now, and its monthly fee is charged as usual.";
    case "active_unpaid":
      return "The shop is active again now, but its last month is not paid, so it stays locked until its wallet covers the month.";
    case "active_renewal_off":
      return "The shop is active again now. Renewal is off, so when its month ends it is not charged and the shop locks.";
    case "active_unpaid_renewal_off":
      return `The shop is active again now, but its last month is not paid and renewal is off, so it stays locked until ${renewalOffOpens()}.`;
    case "trial": {
      const ended = trialEndsAt !== null && Date.parse(trialEndsAt) <= now.getTime();
      return ended
        ? "The shop goes back to its trial now. Its trial ended unpaid, so it stays locked until it pays."
        : "The shop goes back to its trial now: its trial was never paid.";
    }
  }
}

/**
 * A shop that no job charges and whose lock screen opens nothing until it is
 * back: renew_subscription_core and settle_billing_lock answer on_hold for
 * every status but trial and active. The renewal row and both renewal
 * sentences read this one table, so they say the same about one shop (round
 * 24 structure new 4, round 25 data new 1).
 */
const AWAY: Readonly<Record<string, { shop: string; until: string; while: string }>> = {
  limited: { shop: "The shop is paused", until: "until the pause lifts", while: "paused" },
  suspended: { shop: "The shop is on hold", until: "until it comes back", while: "on hold" },
  cancelled: { shop: "The shop is cancelled", until: "until it is made active again", while: "cancelled" },
};

/**
 * The renewal line on the shop page. renew_subscription_core charges only a
 * shop on trial or active: one paused, on hold or cancelled answers on_hold
 * and is not charged, so "charges the wallet each month" would say otherwise.
 * The demo store renews each month at no charge.
 *
 * `lockedFor` is why the shop is locked now (billing_lock_snapshot's reason),
 * or null when it is not: a shop renewal off has already locked is told what
 * happened, not what will (round 24 UX new 8).
 */
export function renewalWords(
  autoRenew: boolean,
  demo: boolean,
  status: string,
  lockedFor: "trial_ended" | "unpaid" | null,
): string {
  // The demo store renews at no charge whatever the switch says (B13).
  if (demo) return autoRenew ? "On: renews each month, never charged (demo store)" : "Off, but the demo store renews each month at no charge";
  const away = AWAY[status];
  // Renewal off: the month's end is not charged, and the shop locks like an unpaid month (20261119073654).
  if (!autoRenew) {
    if (lockedFor === "trial_ended") return "Off: the trial ended unpaid, so the shop is locked";
    if (lockedFor === "unpaid") return "Off: the month ended unpaid, so the shop is locked";
    // Away, nothing charges or locks it: its month's end counts once it is
    // back, and may have passed already (round 25 data new 1).
    if (away) return `Off: not charged while ${away.while}, then the shop locks once its month is over`;
    return "Off: when the month ends it is not charged, and the shop locks";
  }
  if (!away) return "On: charges the wallet each month";
  return status === "cancelled"
    ? "On: not charged while cancelled"
    : `On: not charged while ${away.while}, then charges the wallet each month`;
}

/** What the Renewal switch knows when staff turn renewal back on. */
export interface RenewalOnFacts {
  demo: boolean;
  /** The tenant's status as the record read returns it. */
  status: string;
  onTrial: boolean;
  /** The end of this month or trial; null when there is none. */
  periodEnd: string | null;
  /** The billing lock, when the shop is locked: the month's price opens it. */
  lock: { price_iqd: number } | null;
  walletIqd: number;
}

/** Why no job charges the shop right now, or undefined when one may. */
function notChargedWhile(status: string): string | undefined {
  const away = AWAY[status];
  return away && `${away.shop}, so nothing is charged ${away.until}.`;
}

/**
 * What turning renewal back on does, said before it is done (round 21, UX
 * new 2). For a shop locked with renewal off, it is a charge: the next hourly
 * lock run takes the month from the wallet when it holds it, and the shop
 * opens (20261119073654_renewal_off_stops_charge). A paused or held shop is
 * not charged until it comes back. Otherwise the next month is charged when
 * this one ends, as usual. The demo store is never charged (B13).
 */
export function renewalOnWords(facts: RenewalOnFacts, now: Date = new Date()): string {
  const on = "Renewal turns on.";
  if (facts.demo) return `${on} The demo store is never charged.`;
  const notCharged = notChargedWhile(facts.status);
  if (facts.lock) {
    const price = formatIQD(facts.lock.price_iqd);
    if (notCharged) return `${on} ${notCharged} Then the wallet pays ${price} for the month and the shop opens.`;
    const wallet = formatIQD(facts.walletIqd);
    return facts.walletIqd >= facts.lock.price_iqd
      ? `${on} Within the hour the wallet pays ${price} for the month and the shop opens. The wallet holds ${wallet} now.`
      : `${on} The wallet holds ${wallet}, short of the month's ${price}. Once it holds the month, it pays and the shop opens.`;
  }
  if (notCharged) return `${on} ${notCharged}`;
  if (facts.onTrial) return `${on} When the trial ends, the first month is charged from the wallet as usual.`;
  if (facts.periodEnd && Date.parse(facts.periodEnd) <= now.getTime()) {
    return `${on} This month ended ${formatDay(facts.periodEnd, now)}, so the next renewal run charges a new month from the wallet.`;
  }
  const after = facts.periodEnd ? ` after ${formatDay(facts.periodEnd, now)}` : "";
  return `${on} The month${after} is charged from the wallet as usual.`;
}

/**
 * What stopping renewal does, said before it is done, from the same facts as
 * renewalOnWords (round 22). The demo store renews at no charge whatever the
 * switch says (renew_subscription_core skips renewal off for it). A shop that
 * is locked already stays locked, and no hourly run charges it any more. A
 * trial's end is not charged; otherwise this month runs to its end. A paused,
 * held or cancelled shop is said first: nothing is charged and its lock screen opens
 * nothing until it comes back (settle_billing_lock answers on_hold), and only
 * then does the rest happen (round 23 data new 2).
 */
export function renewalOffWords(facts: RenewalOnFacts, now: Date = new Date()): string {
  if (facts.demo) return "The demo store still renews each month at no charge: this switch changes nothing there.";
  const away = AWAY[facts.status];
  if (facts.lock) {
    const opens = `It opens when ${renewalOffOpens(facts.lock.price_iqd)}.`;
    return away
      ? `${away.shop}, so nothing is charged and nothing opens the lock ${away.until}. Then it stays locked, and no job charges it. ${opens}`
      : `The shop stays locked, and no job charges it. ${opens}`;
  }
  const first = away ? `${away.shop}, so nothing is charged ${away.until}. ` : "";
  if (facts.onTrial) return `${first}When the trial ends it is not charged, and the shop locks until ${renewalOffOpens()}.`;
  if (facts.periodEnd && Date.parse(facts.periodEnd) <= now.getTime()) {
    return `${first}This month ended ${formatDay(facts.periodEnd, now)}. It is not charged, and the shop locks until ${renewalOffOpens()}.`;
  }
  return `${first}${RENEWAL_STOP_WORDS}`;
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

/**
 * The key every write from the shop page's panels runs under. While one runs,
 * its panel stays open, so its answer (a refusal above all) is always seen;
 * a panel that closed mid-write threw its answer away (round 19).
 */
export function shopActionKey(shopId: string) {
  return ["admin", "shop-action", shopId] as const;
}
