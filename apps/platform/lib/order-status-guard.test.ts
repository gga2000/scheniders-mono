import { describe, expect, it } from "vitest";
import { isExchangedOriginalStatusViolation } from "./order-status-guard";

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
