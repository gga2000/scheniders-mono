import { describe, expect, it } from "vitest";
import { statusSideEffect } from "./status-side-effects";

describe("statusSideEffect", () => {
    it.each([
        ["in_transit", "delivered", "deduct_supplies"],
        ["delivered", "completed", null],
        ["completed", "delivered", null],
        ["confirmed", "completed", "deduct_supplies"],
        ["new", "confirmed", null],
        ["confirmed", "cancelled", null],
        ["delivered", "in_transit", null],
        ["in_transit", "rejected", null],
        ["delivered", "refund_delivered", null],
        ["rejected", "in_transit", null],
        ["rejected", "rejected", null],
    ] as const)("%s → %s is %s", (from, to, effect) => {
        expect(statusSideEffect(from, to)).toBe(effect);
    });
});
