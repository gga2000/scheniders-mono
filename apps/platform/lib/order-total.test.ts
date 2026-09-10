import { describe, it, expect } from "vitest";
import type { OrderItem } from "@/types/order";
import { calculateTotal } from "./order-utils";

/**
 * ARCH-4 guard for item totals.
 *
 * There were four implementations of "sum the items": the shared one, an
 * identical copy in split-order-dialog, another inline in use-order-crud, and a
 * dead `calculateOrderTotal` in order-normalize-utils that additionally did
 * `+ deliveryFee - discount`.
 *
 * That last one was the dangerous one. The canonical money convention,
 * established from live data in MONEY-1, is that `orders.price` is the item
 * subtotal MINUS discount with delivery EXCLUDED, and the courier collects
 * price + delivery_fee (see lib/order-money). A helper named
 * "calculateOrderTotal" that folds delivery in is exactly the shape of the
 * original MONEY-1 double-count, waiting for someone to assign it to `price`.
 * It had no callers, so it was deleted rather than kept as a trap.
 */
const item = (price: unknown, quantity: unknown) =>
    ({ name: "x", price, quantity } as unknown as OrderItem);

describe("calculateTotal", () => {
    it("sums price times quantity", () => {
        expect(calculateTotal([item(6000, 2), item(4000, 1)])).toBe(16000);
    });

    it("returns 0 for an empty list", () => {
        expect(calculateTotal([])).toBe(0);
    });

    it("handles values arriving as strings from the jsonb column", () => {
        expect(calculateTotal([item("6000", "2")])).toBe(12000);
    });

    it("treats a missing or unparseable line as 0 rather than poisoning the total", () => {
        // One bad line used to make the whole total NaN, which then rendered as
        // an empty or "NaN" price rather than an obviously wrong number.
        expect(calculateTotal([item(6000, 2), item(undefined, 3)])).toBe(12000);
        expect(calculateTotal([item(6000, 2), item("abc", 1)])).toBe(12000);
        expect(calculateTotal([item(null, null)])).toBe(0);
    });

    it("does not add delivery or subtract discount", () => {
        // This is the item subtotal only. Anything that needs the amount the
        // courier collects must use computeCodAmount in lib/order-money.
        expect(calculateTotal([item(10000, 1)])).toBe(10000);
    });
});
