import { describe, it, expect } from "vitest";
import { doorCash } from "./dispatch-label";
import { computeRefundPayout } from "./order-money";
import type { Order } from "@/types/order";

const refund = (price: number, delivery_fee: number) =>
    ({ is_return: true, price, delivery_fee, payment_status: "cod" }) as unknown as Order;

describe("refund order amount: card and label agree", () => {
    it("deducts the 5,000 pickup fee exactly once", () => {
        const order = refund(-34750, 5000);
        expect(computeRefundPayout(order)).toBe(29750);
        expect(doorCash(order)).toEqual({ direction: "pay", amount: 29750 });
    });

    it("a fee-free refund pays the full amount", () => {
        expect(doorCash(refund(-36750, 0)).amount).toBe(36750);
    });
});
