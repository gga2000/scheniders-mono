import { describe, expect, it } from "vitest";
import { canMoveToTrash, TRASHABLE_ORDERS_FILTER } from "./order-trash";

describe("canMoveToTrash (board O1)", () => {
    it("keeps shipped orders out of the trash", () => {
        for (const status of ["in_transit", "delivered", "completed"]) {
            expect(canMoveToTrash({ status })).toBe(false);
        }
    });

    it("lets orders that have not shipped go", () => {
        for (const status of ["new", "confirmed", "no_response", "cancelled", "rejected"]) {
            expect(canMoveToTrash({ status })).toBe(true);
        }
    });

    it("lets a merchant-guide practice order go whatever its status", () => {
        expect(canMoveToTrash({ status: "delivered", guide_practice: true })).toBe(true);
    });

    it("gives the route the same rule as a PostgREST filter", () => {
        expect(TRASHABLE_ORDERS_FILTER).toBe("status.not.in.(in_transit,delivered,completed),guide_practice.is.true");
    });
});
