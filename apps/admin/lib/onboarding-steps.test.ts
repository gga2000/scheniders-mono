import { describe, expect, it } from "vitest";
import { onboardingDone, type OnboardingFacts } from "./onboarding-steps";

/*
 * Home and the shop page each had their own onboarding rules. Home counted
 * any colour but #1E1E1E as branding, and every shop starts with #3b82f6, so
 * every shop looked branded. The shop page wanted money in the wallet now and
 * counted invited members. Both now tick the steps from these facts.
 */

const nothing: OnboardingFacts = {
  orders: 0,
  activeMembers: 1,
  branding: null,
  storePublishes: null,
  toppedUpIqd: 0,
};

describe("onboardingDone", () => {
  it("a new shop has done nothing", () => {
    expect(Object.values(onboardingDone(nothing)).some(Boolean)).toBe(false);
  });

  it("counts an uploaded logo as branding, not the colours every shop starts with", () => {
    const starting = { logo_url: null, primary_color: "#3b82f6", secondary_color: "#8b5cf6" };
    expect(onboardingDone({ ...nothing, branding: starting }).has_branding).toBe(false);
    expect(onboardingDone({ ...nothing, branding: { ...starting, logo_url: "https://cdn.example/l.png" } }).has_branding).toBe(true);
  });

  it("keeps Wallet done after the money is spent: it reads all money ever added", () => {
    expect(onboardingDone({ ...nothing, toppedUpIqd: 25_000 }).wallet_funded).toBe(true);
  });

  it("needs a second active member, so the owner alone or an invite does not count", () => {
    expect(onboardingDone({ ...nothing, activeMembers: 1 }).has_team).toBe(false);
    expect(onboardingDone({ ...nothing, activeMembers: 2 }).has_team).toBe(true);
  });

  it("counts the store as set up only once the merchant has published it", () => {
    expect(onboardingDone({ ...nothing, storePublishes: null }).has_storefront).toBe(false);
    expect(onboardingDone({ ...nothing, storePublishes: 0 }).has_storefront).toBe(false);
    expect(onboardingDone({ ...nothing, storePublishes: 1 }).has_storefront).toBe(true);
  });

  it("counts a first real order", () => {
    expect(onboardingDone({ ...nothing, orders: 1 }).has_orders).toBe(true);
  });
});
