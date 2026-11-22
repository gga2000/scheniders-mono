/*
 * Where a shop stands, in one line, and what happens next.
 *
 * The shop page showed a status chip and a plan chip, and the same shop could
 * read "Active" beside "CANCELLED". Staff are asked on the phone "why is my
 * shop closed?" and "when do you take the money?", so the page answers both:
 * what the shop is, since when and why, then the next charge with its day and
 * amount, or what opens the shop again.
 */
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { formatDay, formatDayTime, formatIQD } from "@/lib/format";
import { isSubscriptionRunning } from "@/lib/shop-actions";
import { LOCK_REASON_WORDS, lockOpensWords, renewalOffOpens } from "@/lib/billing-lock-label";

export type ShopTone = "paying" | "trial" | "locked" | "paused" | "hold" | "ended" | "internal";

export interface ShopStatusLine {
  tone: ShopTone;
  /** One or two words for the chip: "Paying", "Locked". */
  label: string;
  /** What the shop is, since when and why. */
  sentence: string;
  /** What happens next, with its day and amount; null when nothing is due. */
  next: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

type Detail = Pick<MerchantDetail, "tenant" | "wallet" | "subscription" | "billingLock" | "stoppedBy" | "paidPlan"> &
  Partial<Pick<MerchantDetail, "canForceUnlock">>;

/** "Wallet 4,000 IQD, short by 5,000 IQD." when the wallet cannot pay `price`. */
function shortBy(balance: number, price: number): string {
  return balance >= price ? "" : ` Wallet ${formatIQD(balance)}, short by ${formatIQD(price - balance)}.`;
}

/** The same, for a charge still to come: an unpaid trial end or renewal locks the shop. */
function shortByThen(balance: number, price: number): string {
  const short = shortBy(balance, price);
  return short && `${short} It locks that day unless money is added.`;
}

/** A charge the next renewal run takes, for a period that has already ended. */
function chargeWithRenewal(which: "First" | "Next", balance: number, price: number): string {
  const short = shortBy(balance, price);
  return `${which} charge ${formatIQD(price)} with the next daily renewal.${short && `${short} It locks then unless money is added.`}`;
}

/** A period that ends with renewal off: not charged, and the next daily renewal locks the shop. */
function notRenewed(ends: string): string {
  return `${ends} and is not charged: renewal is off, so the shop locks with the next daily renewal.`;
}

export function shopStatusLine(detail: Detail, now: Date = new Date()): ShopStatusLine {
  const { tenant, wallet, subscription, billingLock, stoppedBy, paidPlan } = detail;
  const balance = wallet?.balance_iqd ?? 0;
  // What the trial's end or the next renewal takes: the plan the shop moves to,
  // with its add-ons. billing_lock_snapshot adds it up as renew_subscription_core
  // charges it; the plan's list price left the add-ons and a waiting plan out.
  const price = billingLock?.price_iqd ?? 0;

  if (billingLock?.locked) {
    const reason = billingLock.reason ? LOCK_REASON_WORDS[billingLock.reason] : "Locked";
    const since = billingLock.since ? ` Locked since ${formatDay(billingLock.since, now)}.` : "";
    return {
      tone: "locked",
      label: "Locked",
      sentence: `${reason}.${since}`,
      // A paused shop, or one whose renewal is off, does not open with money
      // alone; the shop pressing Pay still needs the month in its wallet.
      next: `${lockOpensWords(billingLock.price_iqd, tenant.status === "limited", billingLock.renewal_off, detail.canForceUnlock)}${shortBy(balance, billingLock.price_iqd)}`,
    };
  }

  if (tenant.status === "limited") {
    const until = tenant.restrictions?.paused_until;
    const why = tenant.restrictions?.reason ? ` Reason: ${tenant.restrictions.reason}.` : "";
    return {
      tone: "paused",
      label: "Paused",
      sentence: `Paused by ${stoppedBy?.who ?? "staff"}${until ? ` until ${formatDayTime(until, now)}` : ""}.${why}`,
      next: null,
    };
  }

  if (tenant.status === "suspended") {
    // Board m9: who stopped it and since when, so a colleague knows whom to ask.
    const by = stoppedBy ? ` since ${formatDay(stoppedBy.at, now)}, by ${stoppedBy.who}` : "";
    return { tone: "hold", label: "On hold", sentence: `On hold${by}. No monthly fee while on hold.`, next: null };
  }

  if (tenant.status === "cancelled") {
    return { tone: "ended", label: "Cancelled", sentence: "Cancelled. Nothing is charged.", next: null };
  }

  if (tenant.plan === "internal") {
    return { tone: "internal", label: "Internal", sentence: "Our own shop. It is never billed.", next: null };
  }

  // The demo store (Fermi B13): its month renews at no charge (renew_subscription_core).
  if (tenant.is_demo) {
    return { tone: "internal", label: "Demo", sentence: "The demo store. It is never charged.", next: null };
  }

  // Renewal off (staff): the period's end is not charged and the shop locks,
  // like an unpaid month (20261119073654_renewal_off_stops_charge).
  const renewalOff = subscription?.auto_renew === false;

  if (tenant.status === "trial") {
    const ends = tenant.trial_ends_at;
    const next =
      ends && renewalOff
        ? `The trial ends on ${formatDay(ends, now)} and is not charged: renewal is off, so the shop locks then.`
        : ends && price > 0
          ? `First charge ${formatIQD(price)} on ${formatDay(ends, now)}.${shortByThen(balance, price)}`
          : null;
    return { tone: "trial", label: "Trial", sentence: ends ? `Trial until ${formatDayTime(ends, now)}.` : "On trial.", next };
  }

  // Active: the subscription says whether and when the next month is charged.
  if (!subscription || !isSubscriptionRunning(subscription.status)) {
    return {
      tone: "ended",
      label: "Active",
      sentence: "Active, but its subscription has ended, so it is not billed.",
      next: null,
    };
  }
  const end = subscription.current_period_end;

  // A running month with no charge behind it is free time: a converted lead,
  // free days, a free unlock. The Paying page leaves such a shop out, and the
  // page said "Paying" for a shop never charged (round 18). "No plan charge":
  // the wallet may have paid order fees, never a plan month.
  const charged = paidPlan.month_end !== null && Date.parse(paidPlan.month_end) > now.getTime();
  if (!charged && subscription.status !== "past_due" && Date.parse(end) > now.getTime()) {
    const sentence =
      paidPlan.month_end === null
        ? `No plan charge yet. Free time from ${formatDay(subscription.current_period_start, now)} to ${formatDay(end, now)}.`
        : `Not charged for this time: its last paid month ended on ${formatDay(paidPlan.month_end, now)}. Free until ${formatDay(end, now)}.`;
    if (renewalOff) {
      return { tone: "paying", label: "Free time", sentence, next: notRenewed(`The free time ends on ${formatDay(end, now)}`) };
    }
    const first = paidPlan.first_paid_at === null ? "First" : "Next";
    return {
      tone: "paying",
      label: "Free time",
      sentence,
      next: price > 0 ? `${first} charge ${formatIQD(price)} on ${formatDay(end, now)}.${shortByThen(balance, price)}` : null,
    };
  }

  // A period that has ended and waits for the renewal run. It was paid only
  // when its charged month reaches the period's end: free days move the end
  // past the paid month and keep its start (round 20), and a converted shop's
  // free year was never charged (round 19). Either way it is not "Paying".
  const ended = Date.parse(end) <= now.getTime();
  const periodCharged = paidPlan.month_end !== null && Date.parse(paidPlan.month_end) >= Date.parse(end);
  // Renewal off and the period over: the next daily renewal does not charge
  // it and locks the shop, paid month or free time alike.
  if (ended && renewalOff && subscription.status !== "past_due") {
    return {
      tone: "ended",
      label: "Not renewed",
      sentence: `${periodCharged ? "This month" : "Free time"} ended on ${formatDay(end, now)}. Renewal is off, so it is not charged.`,
      next: `The shop locks with the next daily renewal, until ${renewalOffOpens(price > 0 ? price : null)}.`,
    };
  }
  if (ended && !periodCharged && subscription.status !== "past_due") {
    const endedOn = `Free time ended on ${formatDay(end, now)}.`;
    const which = paidPlan.first_paid_at === null ? "First" : "Next";
    return {
      tone: "trial",
      label: "Due",
      sentence: endedOn,
      next: price > 0 ? chargeWithRenewal(which, balance, price) : null,
    };
  }

  // Free days this month move the period's end past the paid month's own end
  // (admin_extend_subscription moves only current_period_end): say the two
  // apart, so "until when did I pay?" gets the paid month's end, as on the
  // Paying page (round 21, data new 4).
  // Free days are whole days; the renewal sets both ends the same way (start + 30 days).
  const paidUntil =
    paidPlan.month_end !== null && Date.parse(end) - Date.parse(paidPlan.month_end) >= HOUR_MS ? paidPlan.month_end : null;
  const runs = paidUntil
    ? `Paid until ${formatDay(paidUntil, now)}, then free days to ${formatDay(end, now)}.`
    : `This month runs from ${formatDay(subscription.current_period_start, now)} to ${formatDay(end, now)}.`;
  if (renewalOff) {
    return {
      tone: "paying",
      label: "Paying",
      sentence: paidUntil ? `Paying. Renewal is off. ${runs}` : "Paying. Renewal is off.",
      next: notRenewed(`${paidUntil ? "This period" : "The month"} ends on ${formatDay(end, now)}`),
    };
  }
  if (subscription.status === "past_due") {
    return {
      tone: "paying",
      label: "Behind",
      sentence: "The last month is not paid yet.",
      next: price > 0 ? `Next charge ${formatIQD(price)} on ${formatDay(end, now)}.${shortByThen(balance, price)}` : null,
    };
  }
  // A paid month that has ended and waits for the renewal run: the charge
  // comes with the run, not on the month's last day, which has passed (round 20).
  if (ended) {
    return {
      tone: "paying",
      label: "Paying",
      sentence: `Paying. This month ended on ${formatDay(end, now)}.`,
      next: price > 0 ? chargeWithRenewal("Next", balance, price) : null,
    };
  }
  return {
    tone: "paying",
    label: "Paying",
    sentence: `Paying. ${runs}`,
    next: price > 0 ? `Next charge ${formatIQD(price)} on ${formatDay(end, now)}.${shortByThen(balance, price)}` : null,
  };
}
