import { describe, it, expect } from "vitest";
import { computeCodAmount, computeRefundPayout, courierAmount, orderReceipt, toWholeIqd } from "./order-money";

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

describe("courierAmount", () => {
    it("collects the difference plus the fee on a dearer swap", () => {
        expect(courierAmount({ price: 5333, delivery_fee: 5000 })).toBe(10333);
    });
    it("is negative when the courier pays the customer", () => {
        expect(courierAmount({ price: -19333, delivery_fee: 0 })).toBe(-19333);
    });
    it("is 0 on a prepaid order", () => {
        expect(courierAmount({ price: 5000, delivery_fee: 5000, payment_status: "paid" })).toBe(0);
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

describe("orderReceipt", () => {
    const adds = (r: ReturnType<typeof orderReceipt>) => r.subtotal - r.discount + r.delivery;

    it("includes delivery in the total, so the receipt adds up", () => {
        const r = orderReceipt({ price: 85000, delivery_fee: 5000, discount_amount: 0 });
        expect(r).toEqual({ subtotal: 85000, discount: 0, delivery: 5000, total: 90000, collect: 90000 });
        expect(adds(r)).toBe(r.total);
    });

    it("rebuilds the pre-discount subtotal from the already-discounted price", () => {
        // items 125,000 − discount 10,000 = price 115,000; + delivery 6,000 = 121,000
        const r = orderReceipt({ price: 115000, delivery_fee: 6000, discount_amount: 10000 });
        expect(r.subtotal).toBe(125000);
        expect(r.total).toBe(121000);
        expect(adds(r)).toBe(r.total);
    });

    it("totals the same amount the courier collects on a COD order", () => {
        const order = { price: 45000, delivery_fee: 5000, discount_amount: 5000, payment_status: "cod" };
        expect(orderReceipt(order).total).toBe(computeCodAmount(order));
    });

    it("keeps the total but collects nothing on a prepaid order", () => {
        const r = orderReceipt({ price: 27000, delivery_fee: 5000, payment_status: "prepaid" });
        expect(r.total).toBe(32000);
        expect(r.collect).toBe(0);
    });

    it("treats missing fields as zero", () => {
        expect(orderReceipt({})).toEqual({ subtotal: 0, discount: 0, delivery: 0, total: 0, collect: 0 });
        expect(orderReceipt({ price: 64000, delivery_fee: null, discount_amount: null }).total).toBe(64000);
    });
});
