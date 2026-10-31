import { describe, expect, it } from "vitest";
import { ExchangedOrderStatusError, isExchangedOriginalStatusViolation, orderWriteErrorMessage } from "./order-status-guard";

describe("isExchangedOriginalStatusViolation", () => {
    it("recognises the exchange guard's refusal", () => {
        expect(isExchangedOriginalStatusViolation({
            code: "23514",
            message: "This order was delivered and has an exchange or return. Keep it delivered and record the outcome on the exchange or return order.",
        })).toBe(true);
    });

    it("ignores other check violations and other errors", () => {
        expect(isExchangedOriginalStatusViolation({ code: "23514", message: "created_at cannot be in the future" })).toBe(false);
        expect(isExchangedOriginalStatusViolation({ code: "42501", message: "has an exchange or return" })).toBe(false);
        expect(isExchangedOriginalStatusViolation(new Error("boom"))).toBe(false);
        expect(isExchangedOriginalStatusViolation(null)).toBe(false);
    });
});

describe("orderWriteErrorMessage", () => {
    const t = (key: string) => `[${key}]`;

    it("says the same thing for the typed error and the raw database error", () => {
        const raw = { code: "23514", message: "This order was delivered and has an exchange or return." };
        expect(orderWriteErrorMessage(new ExchangedOrderStatusError(), t)).toBe("[orders.status.exchangedOriginal]");
        expect(orderWriteErrorMessage(raw, t)).toBe("[orders.status.exchangedOriginal]");
    });

    it("translates a version conflict instead of showing its code", () => {
        expect(orderWriteErrorMessage(new Error("CONFLICT_DETECTED"), t)).toBe("[orders.error.conflict]");
    });

    it("keeps other messages and falls back for an empty one", () => {
        expect(orderWriteErrorMessage(new Error("Order not found"), t)).toBe("Order not found");
        expect(orderWriteErrorMessage({}, t)).toBe("[orders.error.updateFailed]");
    });
});
