import { describe, expect, it } from "vitest";
import { refundableLines } from "@/lib/refunds/refund-math";
import type { OrderItem } from "@/types/order";
import { previewReplacement } from "./replacement-math";

const item = (name: string, price: number, quantity: number): OrderItem =>
    ({ product_id: name, name, price, quantity }) as OrderItem;

// The same original as packages/supabase/tests/after_sale.sql: two lines
// worth 30,000 and 15,000 sold for 44,000 after a discount.
const lines = refundableLines([item("A", 30000, 1), item("B", 15000, 1)], 44000, []);

describe("previewReplacement", () => {
    it("charges the difference and the fee on a dearer swap", () => {
        const p = previewReplacement(lines, [{ index: 1, quantity: 1 }], [{ price: 20000, quantity: 1 }], 5000, true);
        expect(p.credit).toBe(14667);
        expect(p.newItemsTotal).toBe(20000);
        expect(p.feeKept).toBe(5000);
        expect(p.courierAmount).toBe(10333);
    });

    it("pays the customer back on a cheaper swap with the fee absorbed", () => {
        const p = previewReplacement(lines, [{ index: 0, quantity: 1 }], [{ price: 10000, quantity: 1 }], 5000, false);
        expect(p.credit).toBe(29333);
        expect(p.feeKept).toBe(0);
        expect(p.courierAmount).toBe(-19333);
    });

    it("charges only the fee on a same-price swap", () => {
        const same = refundableLines([item("A", 25000, 1)], 25000, []);
        const p = previewReplacement(same, [{ index: 0, quantity: 1 }], [{ price: 25000, quantity: 1 }], 5000, true);
        expect(p.courierAmount).toBe(5000);
    });

    it("does not cap the fee at the credit", () => {
        const cheap = refundableLines([item("A", 2000, 1)], 2000, []);
        const p = previewReplacement(cheap, [{ index: 0, quantity: 1 }], [{ price: 2000, quantity: 1 }], 5000, true);
        expect(p.feeKept).toBe(5000);
    });

    it("ignores lines already taken back", () => {
        const taken = refundableLines([item("A", 30000, 2)], 60000, [{ index: 0, quantity: 2, amount: 60000 }]);
        const p = previewReplacement(taken, [{ index: 0, quantity: 1 }], [], 0, false);
        expect(p.backLines).toHaveLength(0);
        expect(p.credit).toBe(0);
    });
});
