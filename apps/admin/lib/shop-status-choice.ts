import { z } from "zod";
import type { TenantStatus } from "@/types/admin";

/**
 * The status moves `admin_update_shop` refuses, in words staff can act on. The
 * card menu and the Pipeline ask `statusPickRefusal` before they offer a move,
 * so staff are never offered one the database will only refuse. The demo
 * store's refusal lives in `shop-update.ts`: the demo store is on no list.
 */
export const STATUS_REFUSALS = {
  /** "Limited" is a pause: the Pause button sets what is blocked and for how long. */
  use_pause: "Use Pause to limit a shop: it sets what is blocked and for how long.",
  /** A paused shop keeps its status until the pause is lifted. */
  paused: "This shop is paused. Lift the pause first (on its page).",
  /**
   * A trial shop becomes a paying shop on its own page, through "Start paid
   * time, no charge" (convert-trial), never by picking Active.
   */
  still_trial: 'This shop is on trial. Open its page and use "Start paid time, no charge" to make it a paying shop.',
  /** Only a shop whose trial was never paid (or that has no subscription) can go back to Trial. */
  not_trialing: "This shop's subscription is no longer an unpaid trial, so it cannot go back to Trial.",
} as const;

export type StatusRefusal = keyof typeof STATUS_REFUSALS;

/** What a status pick needs to know about the shop. */
export interface StatusPickShop {
  status: TenantStatus;
  /** No subscription, or a trial that was never paid (`isTrialUnpaid`): it may go back to Trial. */
  trial_unpaid: boolean;
}

/** Why `admin_update_shop` would refuse moving `shop` to `to`; null when it accepts. */
export function statusPickRefusal(shop: StatusPickShop, to: TenantStatus): StatusRefusal | null {
  if (to === shop.status) return null;
  if (to === "limited") return "use_pause";
  if (shop.status === "limited") return "paused";
  if (shop.status === "trial" && to === "active") return "still_trial";
  if (to === "trial" && !shop.trial_unpaid) return "not_trialing";
  return null;
}

/** The newest subscription, as far as a status pick needs it. */
export interface PickSubscription {
  status: string;
  current_period_end: string | null;
}

/**
 * The trial was never paid: the subscription is still trialing, or past due
 * with its period ending at the trial end (the billing lock's mark of an
 * unpaid trial). `admin_update_shop` uses the same rule (`_trial_unpaid`):
 * such a shop may go back to Trial, and Active brings it back as Trial.
 */
export function isTrialUnpaid(subscription: PickSubscription, trialEndsAt: string | null): boolean {
  if (subscription.status === "trialing") return true;
  return (
    subscription.status === "past_due" &&
    trialEndsAt !== null &&
    subscription.current_period_end !== null &&
    Date.parse(subscription.current_period_end) === Date.parse(trialEndsAt)
  );
}

/** Whether a shop may be picked Trial: it has no subscription, or its trial was never paid. */
export function canGoBackToTrial(subscription: PickSubscription | null | undefined, trialEndsAt: string | null): boolean {
  return !subscription || isTrialUnpaid(subscription, trialEndsAt);
}

/**
 * Said when the server saved Trial for another pick: a shop whose trial was
 * never paid comes back from hold as a trial, even when Active is picked
 * (`admin_update_shop`'s only rewrite). Null when it saved what was picked.
 */
export function statusLandedText(picked: TenantStatus, answer: unknown): string | null {
  const saved = savedShopSchema.safeParse(answer);
  return saved.success && saved.data.status === "trial" && picked !== "trial"
    ? "Back on Trial: its trial was never paid, so it reopens as a trial."
    : null;
}

/** The shop a status change answers with (`PATCH /api/merchants/[id]`), as far as the pick needs it. */
const savedShopSchema = z.object({ status: z.string() });
