import { describe, expect, it } from "vitest";
import { abandonedCartChip } from "./abandoned-cart";

const AT = "2026-10-05T13:07:14Z";

describe("abandonedCartChip", () => {
    it("is empty for an order that never was a cart", () => {
        expect(abandonedCartChip({ status: "confirmed", abandoned_cart_at: null, abandoned_cart_outcome: null })).toBeNull();
    });

    it("is empty while the cart is still open in Abandoned", () => {
        expect(abandonedCartChip({ status: "pending_checkout", abandoned_cart_at: AT, abandoned_cart_outcome: null })).toBeNull();
        expect(abandonedCartChip({ status: "pending_checkout", abandoned_cart_at: AT, abandoned_cart_outcome: "kept" })).toBeNull();
    });

    it("names who took it when staff moved it on, at any later status", () => {
        for (const status of ["contacted", "confirmed", "completed", "cancelled"] as const) {
            expect(
                abandonedCartChip({ status, abandoned_cart_at: AT, abandoned_cart_outcome: "contacted", abandoned_cart_resolved_by_name: " karrar " }),
            ).toEqual({ kind: "contacted", leftAt: AT, by: "karrar" });
        }
    });

    it("keeps the chip without a name for history rows with no actor", () => {
        expect(
            abandonedCartChip({ status: "completed", abandoned_cart_at: AT, abandoned_cart_outcome: "contacted", abandoned_cart_resolved_by_name: null }),
        ).toEqual({ kind: "contacted", leftAt: AT, by: null });
    });

    it("marks the real order of a customer who came back", () => {
        expect(abandonedCartChip({ status: "new", abandoned_cart_at: AT, abandoned_cart_outcome: "returned" })).toEqual({ kind: "returned", leftAt: AT });
    });

    it("shows nothing for carts the system removed", () => {
        for (const outcome of ["junk_phone", "junk_location", "expired", "already_ordered"] as const) {
            expect(abandonedCartChip({ status: "cancelled", abandoned_cart_at: AT, abandoned_cart_outcome: outcome })).toBeNull();
        }
    });
});
