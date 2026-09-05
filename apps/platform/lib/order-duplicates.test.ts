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

import { findOrderDuplicates, findPreviousOrderForCustomer } from "./order-duplicates";

type Cand = {
    id: string; phone: string; created_at: string; is_return: boolean;
    items: { name: string; quantity: number; price: number }[];
};
const cand = (
    c: Omit<Cand, "is_return" | "items"> & { is_return?: boolean; items?: { name: string }[] },
): Cand => ({
    is_return: false,
    ...c,
    items: (c.items ?? []).map(i => ({ quantity: 1, price: 0, ...i })),
});
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

describe("findOrderDuplicates — mirrored by public.get_order_duplicate_flags", () => {
    const target = cand({ id: "T", phone: "07701234567", created_at: at(0), items: [{ name: "Kebab" }] });

    it("flags the same phone inside the 72h window regardless of items", () => {
        const found = findOrderDuplicates(target, [cand({ id: "A", phone: "07701234567", created_at: at(48), items: [{ name: "Tea" }] })]);
        expect(found.map(o => o.id)).toEqual(["A"]);
    });

    it("does not flag the same phone outside 72h when items differ", () => {
        const found = findOrderDuplicates(target, [cand({ id: "B", phone: "07701234567", created_at: at(24 * 5), items: [{ name: "Tea" }] })]);
        expect(found).toHaveLength(0);
    });

    it("flags 3-7 days out when an item name overlaps", () => {
        const found = findOrderDuplicates(target, [cand({ id: "C", phone: "07701234567", created_at: at(24 * 5), items: [{ name: "Kebab Mashwi" }] })]);
        expect(found.map(o => o.id)).toEqual(["C"]);
    });

    it("matches item names in either direction", () => {
        const broad = cand({ id: "T2", phone: "07701234567", created_at: at(0), items: [{ name: "Kebab Mashwi" }] });
        const found = findOrderDuplicates(broad, [cand({ id: "D", phone: "07701234567", created_at: at(24 * 5), items: [{ name: "Kebab" }] })]);
        expect(found.map(o => o.id)).toEqual(["D"]);
    });

    it("ignores a different customer, itself, and return orders", () => {
        const found = findOrderDuplicates(target, [
            cand({ id: "E", phone: "07709998888", created_at: at(1) }),
            cand({ id: "T", phone: "07701234567", created_at: at(0) }),
            cand({ id: "F", phone: "07701234567", created_at: at(1), is_return: true }),
        ]);
        expect(found).toHaveLength(0);
    });

    it("treats differently formatted phones as the same customer", () => {
        const found = findOrderDuplicates(target, [cand({ id: "G", phone: "+9647701234567", created_at: at(1) })]);
        expect(found.map(o => o.id)).toEqual(["G"]);
    });
});

describe("findPreviousOrderForCustomer", () => {
    const target = cand({ id: "T", phone: "07701234567", created_at: at(24) });

    it("returns the most recent other order for that customer", () => {
        const prev = findPreviousOrderForCustomer(target, [
            cand({ id: "OLD", phone: "07701234567", created_at: at(100) }),
            cand({ id: "NEW", phone: "07701234567", created_at: at(2) }),
        ]);
        expect(prev?.id).toBe("NEW");
    });

    it("is null for a return order", () => {
        const ret = cand({ id: "R", phone: "07701234567", created_at: at(1), is_return: true });
        expect(findPreviousOrderForCustomer(ret, [cand({ id: "X", phone: "07701234567", created_at: at(5) })])).toBeNull();
    });

    it("is null when the customer has no other order", () => {
        expect(findPreviousOrderForCustomer(target, [cand({ id: "T", phone: "07701234567", created_at: at(24) })])).toBeNull();
    });
});
