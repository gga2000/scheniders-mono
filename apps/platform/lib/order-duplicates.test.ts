import { describe, it, expect } from "vitest";
import { getOrderBaseId, computeCustomerOrderCounts } from "./order-duplicates";

type Row = { phone: string; order_id: string; is_archived?: boolean; is_return?: boolean };
const rows = (r: Row[]) => r.map(x => ({ is_archived: false, is_return: false, ...x })) as never;

/**
 * These expectations are shared with SQL: `public.order_base_id` and
 * `public.get_customer_order_counts` are checked against the same cases, so the
 * client and the server can never drift on duplicate badges.
 */
describe("getOrderBaseId — mirrored by public.order_base_id", () => {
    const cases: [string, string][] = [
        ["LF-12345-678", "12345"],
        ["LF-999-1", "999"],
        ["DLV-4455", "4455"],
        ["DLV-", ""],
        ["1260824001", "1260824001"],
        ["RPL-7788", "7788"],
        ["ORD-12-AB", "12"],
        ["ABC", "ABC"],
        ["", ""],
    ];
    for (const [input, expected] of cases) {
        it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
            expect(getOrderBaseId(input)).toBe(expected);
        });
    }
    it("treats null/undefined as empty", () => {
        expect(getOrderBaseId(null)).toBe("");
        expect(getOrderBaseId(undefined)).toBe("");
    });
});

describe("computeCustomerOrderCounts — mirrored by public.get_customer_order_counts", () => {
    it("counts distinct orders for one customer", () => {
        const counts = computeCustomerOrderCounts(rows([
            { phone: "07701234567", order_id: "1260824001" },
            { phone: "07701234567", order_id: "1260824002" },
        ]));
        expect(counts.get("7701234567")).toBe(2);
    });

    it("treats differently-formatted phones as the same customer", () => {
        const counts = computeCustomerOrderCounts(rows([
            { phone: "07701234567",    order_id: "1260824001" },
            { phone: "+9647701234567", order_id: "1260824002" },
        ]));
        expect(counts.get("7701234567")).toBe(2);
    });

    it("counts an order once per base id, not once per row", () => {
        // Same underlying LightFunnels order re-imported as two rows.
        const counts = computeCustomerOrderCounts(rows([
            { phone: "07701234567", order_id: "LF-5000-1" },
            { phone: "07701234567", order_id: "LF-5000-2" },
        ]));
        expect(counts.get("7701234567")).toBe(1);
    });

    it("skips archived and return orders", () => {
        const counts = computeCustomerOrderCounts(rows([
            { phone: "07701234567", order_id: "1260824001" },
            { phone: "07701234567", order_id: "1260824002", is_archived: true },
            { phone: "07701234567", order_id: "1260824003", is_return: true },
        ]));
        expect(counts.get("7701234567")).toBe(1);
    });

    it("keeps separate customers separate", () => {
        const counts = computeCustomerOrderCounts(rows([
            { phone: "07701234567", order_id: "1260824001" },
            { phone: "07709998888", order_id: "1260824002" },
        ]));
        expect(counts.get("7701234567")).toBe(1);
        expect(counts.get("7709998888")).toBe(1);
    });

    it("returns nothing for an empty list", () => {
        expect(computeCustomerOrderCounts([]).size).toBe(0);
    });
});
