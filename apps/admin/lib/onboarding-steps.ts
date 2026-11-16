/**
 * A shop's onboarding steps, in the order the dashboard shows them. The API
 * that works out which steps are done and the tracker that draws the ticks
 * both read this list. They each had their own keys, so four of the five ticks
 * always showed a cross beside a correct percent. No imports: safe in the
 * browser bundle.
 */
export const ONBOARDING_STEPS = [
  { key: "has_orders", label: "Orders" },
  { key: "has_team", label: "Team" },
  { key: "has_branding", label: "Branding" },
  { key: "has_storefront", label: "Storefront" },
  { key: "wallet_funded", label: "Wallet" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

/**
 * What a shop has done so far. Home and the shop page both tick the steps from
 * these facts with `onboardingDone`, so one shop never shows two progresses.
 */
export interface OnboardingFacts {
  /** Real orders, all time (admin_order_facts). */
  orders: number;
  /** Team members whose status is "active", the owner included. */
  activeMembers: number;
  /**
   * Every shop starts with the same colours (#3b82f6), so only an uploaded
   * logo shows the merchant has set up their brand.
   */
  branding: { logo_url?: string | null } | null | undefined;
  /**
   * How many times the store builder was published (tenants.store_config_rev,
   * raised only by a publish). Sign-up already writes config_version 2 and a
   * starter store, so neither of those says the merchant published anything.
   */
  storePublishes: number | null | undefined;
  /** All money ever added to the wallet, so spending it does not undo the step. */
  toppedUpIqd: number;
}

export function onboardingDone(facts: OnboardingFacts): Record<OnboardingStepKey, boolean> {
  return {
    has_orders: facts.orders > 0,
    has_team: facts.activeMembers > 1,
    has_branding: Boolean(facts.branding?.logo_url),
    has_storefront: (facts.storePublishes ?? 0) > 0,
    wallet_funded: facts.toppedUpIqd > 0,
  };
}
