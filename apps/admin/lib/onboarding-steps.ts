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
