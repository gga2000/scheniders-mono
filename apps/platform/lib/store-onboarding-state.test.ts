import { describe, expect, it } from "vitest";
import { needsStoreOnboarding } from "./store-onboarding-state";

describe("needsStoreOnboarding", () => {
    const signupDefault = { template: { direction_id: "kinetic-ink", version: 1, source: "signup" as const } };
    const built = { template: { direction_id: "kinetic-ink", version: 1 } };

    it("sends a store with no config to the wizard", () => {
        expect(needsStoreOnboarding(null, null)).toBe(true);
    });
    it("still sends a store showing only the sign-up default to the wizard", () => {
        expect(needsStoreOnboarding(signupDefault, null)).toBe(true);
    });
    it("leaves a store with a draft or a merchant-built config alone", () => {
        expect(needsStoreOnboarding(signupDefault, { schema_version: 2 })).toBe(false);
        expect(needsStoreOnboarding(built, null)).toBe(false);
        expect(needsStoreOnboarding({}, null)).toBe(false);
    });
});
