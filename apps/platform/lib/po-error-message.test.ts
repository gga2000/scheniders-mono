import { describe, it, expect } from "vitest";
import { purchaseOrderErrorKey } from "./po-error-message";

describe("purchaseOrderErrorKey", () => {
    it("maps permission and validation errors, and falls back to a generic message", () => {
        expect(purchaseOrderErrorKey({ code: "42501" })).toBe("supplies.err.notAllowed");
        expect(purchaseOrderErrorKey({ code: "22023", message: "cannot receive more than was ordered" })).toBe("supplies.err.invalid");
        expect(purchaseOrderErrorKey({
            code: "23505",
            message: 'duplicate key value violates unique constraint "purchase_orders_one_draft_per_supplier"',
        })).toBe("supplies.err.draftExists");
        expect(purchaseOrderErrorKey({ code: "23505", message: "tenant_po_number" })).toBe("supplies.err.generic");
        expect(purchaseOrderErrorKey({ code: "22023", message: "this receipt was already saved with other quantities" }))
            .toBe("supplies.err.alreadyReceived");
        expect(purchaseOrderErrorKey(new Error("boom"))).toBe("supplies.err.generic");
        expect(purchaseOrderErrorKey(null)).toBe("supplies.err.generic");
    });
});
