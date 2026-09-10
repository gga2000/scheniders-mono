import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import { orderMatchesRiskLevel } from "./order-filter-utils";

/**
 * MOB-2 guard, the risk half. "Flagged" was implemented four times — in the
 * desktop page's filter memo, in its two "needs attention" counters, and again
 * in MobileOrdersPage — so the number on the card could disagree with the list
 * you got after clicking it, and mobile could disagree with desktop entirely.
 */
function order(partial: Partial<Order>): Order {
    return {
        id: "id-1",
        created_at: "2026-09-01T00:00:00.000Z",
        order_id: "1260901001",
        customer_name: "أحمد",
        phone: "07701234567",
        city: "بغداد",
        address_details: "شارع 14 رمضان، بناية 3",
        items: [],
        price: 1000,
        status: "new",
        is_return: false,
        ...partial,
    } as Order;
}

describe("orderMatchesRiskLevel", () => {
    it("treats a data-quality problem as flagged", () => {
        expect(orderMatchesRiskLevel(order({ address_details: "" }), "flagged")).toBe(true);
        expect(orderMatchesRiskLevel(order({ phone: "0770123" }), "flagged")).toBe(true);
        expect(orderMatchesRiskLevel(order({ needs_attention: true }), "flagged")).toBe(true);
    });

    it("treats a rejected order as flagged even when its data is clean", () => {
        expect(orderMatchesRiskLevel(order({ status: "rejected" }), "flagged")).toBe(true);
    });

    it("does not flag a clean order", () => {
        expect(orderMatchesRiskLevel(order({}), "flagged")).toBe(false);
    });

    it("matches a real risk level against the joined risk data, not the flag rule", () => {
        const risky = order({ risk_data: { level: "high" } } as Partial<Order>);
        expect(orderMatchesRiskLevel(risky, "high")).toBe(true);
        expect(orderMatchesRiskLevel(risky, "medium")).toBe(false);
        // A rejected order is "flagged" but carries no risk level of its own.
        expect(orderMatchesRiskLevel(order({ status: "rejected" }), "high")).toBe(false);
    });

    it("does not match an order with no risk data at all", () => {
        expect(orderMatchesRiskLevel(order({}), "blocked")).toBe(false);
    });
});
