import { describe, it, expect } from "vitest";
import type { OrderItem } from "@/types/order";
import { paidLines, refundableLines, lineRefundAmount, previewRefund } from "./refund-math";

const item = (name: string, price: number, quantity: number): OrderItem => ({ name, price, quantity });

describe("paidLines", () => {
    it("matches item totals when there is no discount", () => {
        const lines = paidLines([item("A", 18375, 2), item("B", 10000, 1)], 46750);
        expect(lines.map((l) => l.paid)).toEqual([36750, 10000]);
    });

    it("spreads an order discount by line value and sums exactly to the price", () => {
        // 30,000 + 15,000 = 45,000 minus a 1,000 discount = 44,000 paid.
        const lines = paidLines([item("A", 10000, 3), item("B", 15000, 1)], 44000);
        expect(lines.map((l) => l.paid)).toEqual([29333, 14667]);
        expect(lines.reduce((s, l) => s + l.paid, 0)).toBe(44000);
    });

    it("gives the rounding to the last line", () => {
        const lines = paidLines([item("A", 1, 1), item("B", 1, 1), item("C", 1, 1)], 10000);
        expect(lines.map((l) => l.paid)).toEqual([3333, 3333, 3334]);
    });
});

describe("partial refunds", () => {
    const items = [item("Perfume", 18375, 2)];

    it("refunds one of two units at half the line", () => {
        const [line] = refundableLines(items, 36750, []);
        expect(lineRefundAmount(line, 1)).toBe(18375);
    });

    it("refunds whatever is left on the last unit, so repeated partials never drift", () => {
        const odd = [item("A", 10000, 3)];
        const first = refundableLines(odd, 29999, []);
        const a = lineRefundAmount(first[0], 1);
        const second = refundableLines(odd, 29999, [{ index: 0, quantity: 1, amount: a }]);
        const b = lineRefundAmount(second[0], 1);
        const third = refundableLines(odd, 29999, [
            { index: 0, quantity: 1, amount: a },
            { index: 0, quantity: 1, amount: b },
        ]);
        const c = lineRefundAmount(third[0], 1);
        expect(a + b + c).toBe(29999);
    });

    it("never refunds more units than remain", () => {
        const lines = refundableLines(items, 36750, [{ index: 0, quantity: 1, amount: 18375 }]);
        const preview = previewRefund(lines, [{ index: 0, quantity: 5 }], 0);
        expect(preview.lines[0].quantity).toBe(1);
        expect(preview.itemsTotal).toBe(18375);
    });
});

describe("previewRefund", () => {
    const lines = refundableLines([item("Perfume", 18375, 2)], 36750, []);

    it("subtracts the pickup fee kept (the design's worked example)", () => {
        const preview = previewRefund(lines, [{ index: 0, quantity: 1 }], 5000);
        expect(preview).toMatchObject({ itemsTotal: 18375, deductions: 5000, customerReceives: 13375 });
    });

    it("full refund equals the order price", () => {
        expect(previewRefund(lines, [{ index: 0, quantity: 2 }], 0).customerReceives).toBe(36750);
    });

    it("never lets deductions exceed the items refunded", () => {
        const small = refundableLines([item("A", 3000, 1)], 3000, []);
        expect(previewRefund(small, [{ index: 0, quantity: 1 }], 5000)).toMatchObject({
            deductions: 3000,
            customerReceives: 0,
        });
    });

    it("drops lines with zero quantity", () => {
        expect(previewRefund(lines, [{ index: 0, quantity: 0 }], 0).lines).toEqual([]);
    });
});
