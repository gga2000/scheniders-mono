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
import { LOCK_REASON_WORDS } from "@/lib/billing-lock-label";

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

type Detail = Pick<MerchantDetail, "tenant" | "wallet" | "subscription" | "billingLock" | "stoppedBy" | "paidPlan">;

/** "Wallet 4,000 IQD, short by 5,000 IQD." when the wallet cannot pay `price`. */
function shortBy(balance: number, price: number): string {
  return balance >= price ? "" : ` Wallet ${formatIQD(balance)}, short by ${formatIQD(price - balance)}.`;
}

/** The same, for a charge still to come: an unpaid trial end or renewal locks the shop. */
function shortByThen(balance: number, price: number): string {
  const short = shortBy(balance, price);
  return short && `${short} It locks that day unless money is added.`;
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
    const amount = formatIQD(billingLock.price_iqd);
    const short = shortBy(balance, billingLock.price_iqd);
    return {
      tone: "locked",
      label: "Locked",
      sentence: `${reason}.${since}`,
      // A paused shop is not charged, so money does not open its lock until
      // the pause lifts (settle_billing_lock answers on_hold).
      next:
        tenant.status === "limited"
          ? `Paused, so the lock stays until the pause lifts. Then paying ${amount} from the wallet opens it.${short}`
          : `Paying ${amount} from the wallet opens it again.${short}`,
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

  if (tenant.status === "trial") {
    const ends = tenant.trial_ends_at;
    return {
      tone: "trial",
      label: "Trial",
      sentence: ends ? `Trial until ${formatDayTime(ends, now)}.` : "On trial.",
      next: ends && price > 0 ? `First charge ${formatIQD(price)} on ${formatDay(ends, now)}.${shortByThen(balance, price)}` : null,
    };
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
  const charged = paidPlan.paid_until !== null && Date.parse(paidPlan.paid_until) > now.getTime();
  if (!charged && subscription.status !== "past_due" && Date.parse(end) > now.getTime()) {
    const sentence =
      paidPlan.paid_until === null
        ? `No plan charge yet. Free time from ${formatDay(subscription.current_period_start, now)} to ${formatDay(end, now)}.`
        : `Not charged for this time: its last paid month ended on ${formatDay(paidPlan.paid_until, now)}. Free until ${formatDay(end, now)}.`;
    if (subscription.auto_renew === false) {
      return { tone: "paying", label: "Free time", sentence, next: `The free time ends on ${formatDay(end, now)} and is not renewed.` };
    }
    const first = paidPlan.first_paid_at === null ? "First" : "Next";
    return {
      tone: "paying",
      label: "Free time",
      sentence,
      next: price > 0 ? `${first} charge ${formatIQD(price)} on ${formatDay(end, now)}.${shortByThen(balance, price)}` : null,
    };
  }

  // Free time that has ended and waits for the renewal run: no charged month
  // covers this period, so it is not "Paying" (round 19: a shop never charged
  // read "Paying" from the end of its free year until the run charged it).
  const periodCharged =
    paidPlan.paid_until !== null && Date.parse(paidPlan.paid_until) > Date.parse(subscription.current_period_start);
  if (!periodCharged && subscription.status !== "past_due") {
    const ended = `Free time ended on ${formatDay(end, now)}.`;
    if (subscription.auto_renew === false) {
      return { tone: "ended", label: "Free time ended", sentence: `${ended} Renewal is off, so it is not charged.`, next: null };
    }
    const first = paidPlan.first_paid_at === null ? "first" : "next";
    return {
      tone: "trial",
      label: "Due",
      sentence: `${ended} The ${first} charge runs with the next renewal.`,
      next:
        price > 0
          ? `${first === "first" ? "First" : "Next"} charge ${formatIQD(price)} with the next renewal.${
              shortBy(balance, price) && `${shortBy(balance, price)} It locks then unless money is added.`
            }`
          : null,
    };
  }

  if (subscription.auto_renew === false) {
    return {
      tone: "paying",
      label: "Paying",
      sentence: "Paying. Renewal is off.",
      next: `The month ends on ${formatDay(end, now)} and is not renewed.`,
    };
  }
  return {
    tone: "paying",
    label: subscription.status === "past_due" ? "Behind" : "Paying",
    sentence:
      subscription.status === "past_due"
        ? "The last month is not paid yet."
        : `Paying. This month runs from ${formatDay(subscription.current_period_start, now)} to ${formatDay(end, now)}.`,
    next: price > 0 ? `Next charge ${formatIQD(price)} on ${formatDay(end, now)}.${shortByThen(balance, price)}` : null,
  };
}
