import { describe, it, expect } from "vitest";
import { computeCodAmount, computeRefundPayout, toWholeIqd } from "./order-money";

// Canonical convention, established from live data (2026-08-22):
//   orders.price = line-item subtotal MINUS discount  (delivery NOT included)
//   orders.delivery_fee = delivery, tracked separately
//   the courier therefore collects price + delivery_fee
// 6,532 rows follow this; the discount is already applied in `price`
// (180 of 186 discounted rows), so COD must NOT subtract it again.

describe("computeCodAmount", () => {
    it("adds the delivery fee to the (already discounted) price", () => {
        expect(computeCodAmount({ price: 20000, delivery_fee: 5000 })).toBe(25000);
    });

    it("does NOT subtract the discount again — price already has it applied", () => {
        // items 25,000 − discount 5,000 = price 20,000; + delivery 5,000 = 25,000
        expect(computeCodAmount({ price: 20000, delivery_fee: 5000, discount_amount: 5000 })).toBe(25000);
    });

    it("collects zero on prepaid orders", () => {
        expect(computeCodAmount({ price: 20000, delivery_fee: 5000, payment_status: "prepaid" })).toBe(0);
        expect(computeCodAmount({ price: 20000, delivery_fee: 5000, payment_status: "paid" })).toBe(0);
    });

    it("still collects on cod / pending / partial", () => {
        expect(computeCodAmount({ price: 10000, delivery_fee: 3000, payment_status: "cod" })).toBe(13000);
    });

    it("treats missing delivery_fee as zero", () => {
        expect(computeCodAmount({ price: 15000 })).toBe(15000);
    });

    it("treats a missing price as zero rather than NaN", () => {
        expect(computeCodAmount({ delivery_fee: 5000 })).toBe(5000);
        expect(computeCodAmount({})).toBe(0);
    });

    it("returns whole IQD — no fractional currency", () => {
        expect(computeCodAmount({ price: 19999.6, delivery_fee: 0.2 })).toBe(20000);
        expect(Number.isInteger(computeCodAmount({ price: 1234.4, delivery_fee: 0 }))).toBe(true);
    });

    it("never returns a negative amount", () => {
        expect(computeCodAmount({ price: -5000, delivery_fee: 0 })).toBe(0);
    });
});

describe("computeRefundPayout", () => {
    it("pays the items refunded less the pickup fee kept", () => {
        expect(computeRefundPayout({ price: -18375, delivery_fee: 5000 })).toBe(13375);
    });

    it("pays the full items amount when no fee is kept", () => {
        expect(computeRefundPayout({ price: -36750, delivery_fee: 0 })).toBe(36750);
    });

    it("never goes below zero", () => {
        expect(computeRefundPayout({ price: -3000, delivery_fee: 5000 })).toBe(0);
    });
});

describe("toWholeIqd", () => {
    it("rounds a fractional amount to whole dinars", () => {
        expect(toWholeIqd(1000.4)).toBe(1000);
        expect(toWholeIqd(1000.5)).toBe(1001);
        expect(toWholeIqd("12500.75")).toBe(12501);
    });

    it("leaves a whole amount untouched", () => {
        expect(toWholeIqd(25000)).toBe(25000);
        expect(toWholeIqd("25000")).toBe(25000);
    });

    it("treats empty, non-numeric and negative input as zero, as the inputs did before", () => {
        expect(toWholeIqd("")).toBe(0);
        expect(toWholeIqd("abc")).toBe(0);
        expect(toWholeIqd(null)).toBe(0);
        expect(toWholeIqd(undefined)).toBe(0);
        expect(toWholeIqd(Number.NaN)).toBe(0);
        expect(toWholeIqd(-5)).toBe(0);
    });

    it("ignores a value that cannot be a price", () => {
        expect(toWholeIqd(Number.POSITIVE_INFINITY)).toBe(0);
    });
});
