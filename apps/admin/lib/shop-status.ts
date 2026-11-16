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

type Detail = Pick<MerchantDetail, "tenant" | "wallet" | "subscription" | "planLimits" | "billingLock">;

const LOCK_REASON = { trial_ended: "Trial ended, not paid", unpaid: "Month not paid" } as const;

/** "Wallet 4,000 IQD, short by 5,000 IQD." when the wallet cannot pay `price`. */
function shortBy(balance: number, price: number): string {
  return balance >= price ? "" : ` Wallet ${formatIQD(balance)}, short by ${formatIQD(price - balance)}.`;
}

export function shopStatusLine(detail: Detail, now: Date = new Date()): ShopStatusLine {
  const { tenant, wallet, subscription, planLimits, billingLock } = detail;
  const balance = wallet?.balance_iqd ?? 0;
  const price = planLimits?.base_price_iqd ?? 0;

  if (billingLock?.locked) {
    const reason = billingLock.reason ? LOCK_REASON[billingLock.reason] : "Locked";
    const since = billingLock.since ? ` Locked since ${formatDay(billingLock.since, now)}.` : "";
    return {
      tone: "locked",
      label: "Locked",
      sentence: `${reason}.${since}`,
      next: `Paying ${formatIQD(billingLock.price_iqd)} from the wallet opens it again.${shortBy(balance, billingLock.price_iqd)}`,
    };
  }

  if (tenant.status === "limited") {
    const until = tenant.restrictions?.paused_until;
    const why = tenant.restrictions?.reason ? ` Reason: ${tenant.restrictions.reason}.` : "";
    return {
      tone: "paused",
      label: "Paused",
      sentence: `Paused by staff${until ? ` until ${formatDayTime(until, now)}` : ""}.${why}`,
      next: null,
    };
  }

  if (tenant.status === "suspended") {
    return { tone: "hold", label: "On hold", sentence: "On hold. No monthly fee while on hold.", next: null };
  }

  if (tenant.status === "cancelled") {
    return { tone: "ended", label: "Cancelled", sentence: "Cancelled. Nothing is charged.", next: null };
  }

  if (tenant.plan === "internal") {
    return { tone: "internal", label: "Internal", sentence: "Our own shop. It is never billed.", next: null };
  }

  if (tenant.status === "trial") {
    const ends = tenant.trial_ends_at;
    return {
      tone: "trial",
      label: "Trial",
      sentence: ends ? `Trial until ${formatDayTime(ends, now)}.` : "On trial.",
      next: ends && price > 0 ? `First charge ${formatIQD(price)} on ${formatDay(ends, now)}.${shortBy(balance, price)}` : null,
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
    next: price > 0 ? `Next charge ${formatIQD(price)} on ${formatDay(end, now)}.${shortBy(balance, price)}` : null,
  };
}
