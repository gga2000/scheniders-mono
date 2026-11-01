import { describe, it, expect } from "vitest";
import { purchaseOrderErrorKey } from "./po-error-message";

describe("purchaseOrderErrorKey", () => {
    it("maps permission and validation errors, and falls back to a generic message", () => {
        expect(purchaseOrderErrorKey({ code: "42501" })).toBe("supplies.err.notAllowed");
        expect(purchaseOrderErrorKey({ code: "22023", message: "cannot receive more than was ordered" })).toBe("supplies.err.invalid");
        expect(purchaseOrderErrorKey(new Error("boom"))).toBe("supplies.err.generic");
        expect(purchaseOrderErrorKey(null)).toBe("supplies.err.generic");
    });
});
