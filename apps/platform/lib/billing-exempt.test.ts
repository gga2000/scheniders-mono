import { describe, it, expect } from "vitest";
import { isBillingExempt, EXEMPT_PLANS_SQL_LIST } from "./billing-exempt";

describe("isBillingExempt", () => {
    it("exempts the house tier", () => {
        expect(isBillingExempt("internal")).toBe(true);
    });

    it("never exempts a paying plan", () => {
        for (const plan of ["starter", "growth", "professional", "enterprise"]) {
            expect(isBillingExempt(plan)).toBe(false);
        }
    });

    it("treats a missing plan as billable", () => {
        // Fail closed: an unknown or absent plan must not buy a free ride.
        expect(isBillingExempt(null)).toBe(false);
        expect(isBillingExempt(undefined)).toBe(false);
        expect(isBillingExempt("")).toBe(false);
    });

    it("does not match on case or whitespace variants", () => {
        expect(isBillingExempt("Internal")).toBe(false);
        expect(isBillingExempt(" internal")).toBe(false);
    });
});

describe("EXEMPT_PLANS_SQL_LIST", () => {
    it("is the parenthesised list PostgREST's not.in filter expects", () => {
        expect(EXEMPT_PLANS_SQL_LIST).toBe("(internal)");
    });

    it("lists exactly the plans isBillingExempt exempts", () => {
        const plans = EXEMPT_PLANS_SQL_LIST.slice(1, -1).split(",").filter(Boolean);
        expect(plans.length).toBeGreaterThan(0);
        for (const plan of plans) expect(isBillingExempt(plan)).toBe(true);
    });
});
