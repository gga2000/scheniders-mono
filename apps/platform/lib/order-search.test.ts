import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import { orderMatchesSearch } from "./order-filter-utils";

/**
 * MOB-2 guard. The mobile screen used to run its own search — a plain
 * `includes()` over a concatenated string — while the desktop list normalized
 * phones and Arabic text. The cases below are exactly the ones where those two
 * disagreed, so a future divergence fails here rather than in a merchant's hand.
 */
function order(partial: Partial<Order>): Order {
    return {
        id: "id-1",
        created_at: "2026-09-01T00:00:00.000Z",
        order_id: "1260901001",
        customer_name: "أحمد",
        phone: "07701234567",
        city: "بغداد",
        items: [],
        price: 1000,
        status: "new",
        is_return: false,
        ...partial,
    } as Order;
}

describe("orderMatchesSearch", () => {
    it("finds a phone typed with spaces and dashes", () => {
        const o = order({ phone: "07701234567" });
        expect(orderMatchesSearch(o, "0770 123 4567")).toBe(true);
        expect(orderMatchesSearch(o, "0770-123-4567")).toBe(true);
        expect(orderMatchesSearch(o, "+9647701234567")).toBe(true);
    });

    it("finds a phone typed in Arabic-Indic digits", () => {
        expect(orderMatchesSearch(order({ phone: "07701234567" }), "٠٧٧٠١٢٣٤٥٦٧")).toBe(true);
    });

    it("finds an Arabic name spelled with a different alef", () => {
        // أحمد searched as احمد
        expect(orderMatchesSearch(order({ customer_name: "أحمد" }), "احمد")).toBe(true);
    });

    it("matches the order number and the sequence number", () => {
        expect(orderMatchesSearch(order({ order_id: "1260901001" }), "0901001")).toBe(true);
        expect(orderMatchesSearch(order({ sequence_number: 4242 } as Partial<Order>), "4242")).toBe(true);
    });

    it("matches city, address and notes", () => {
        expect(orderMatchesSearch(order({ city: "البصرة" }), "البصرة")).toBe(true);
        expect(orderMatchesSearch(order({ address_details: "شارع الجمهورية" }), "الجمهورية")).toBe(true);
        expect(orderMatchesSearch(order({ notes: "زبون مهم" }), "مهم")).toBe(true);
    });

    it("finds a return order by its parent's human-readable number", () => {
        const parent = order({ id: "parent-uuid", order_id: "1260901001" });
        const ret = order({ id: "return-uuid", order_id: "1260901002", original_order_id: "parent-uuid" });
        expect(orderMatchesSearch(ret, "1260901001", [parent, ret])).toBe(true);
    });

    it("does not match an unrelated query", () => {
        expect(orderMatchesSearch(order({}), "zzzznotpresent")).toBe(false);
    });

    it("matches everything for a query that normalizes to nothing", () => {
        // Matching nothing would hide the whole list for a stray keystroke.
        expect(orderMatchesSearch(order({}), "   ")).toBe(true);
    });
});
