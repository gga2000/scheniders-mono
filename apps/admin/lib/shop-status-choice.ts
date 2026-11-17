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
  /** Only a shop whose subscription is still a trial (or that has none) can go back to Trial. */
  not_trialing: "This shop's subscription is not a trial, so it cannot go back to Trial.",
} as const;

export type StatusRefusal = keyof typeof STATUS_REFUSALS;

/** What a status pick needs to know about the shop. */
export interface StatusPickShop {
  status: TenantStatus;
  /** The shop has no subscription, or its newest one is trialing. */
  trial_subscription: boolean;
}

/** Why `admin_update_shop` would refuse moving `shop` to `to`; null when it accepts. */
export function statusPickRefusal(shop: StatusPickShop, to: TenantStatus): StatusRefusal | null {
  if (to === shop.status) return null;
  if (to === "limited") return "use_pause";
  if (shop.status === "limited") return "paused";
  if (shop.status === "trial" && to === "active") return "still_trial";
  if (to === "trial" && !shop.trial_subscription) return "not_trialing";
  return null;
}

/** Whether a newest subscription status lets a shop go back to Trial (none counts). */
export function isTrialSubscription(status: string | null | undefined): boolean {
  return status == null || status === "trialing";
}
