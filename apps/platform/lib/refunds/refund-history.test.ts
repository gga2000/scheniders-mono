import { describe, it, expect } from "vitest";
import type { OrderItem } from "@/types/order";
import { refundHistory } from "./refund-history";
import { refundableLines } from "./refund-math";

const items: OrderItem[] = [
    { name: "Oud", price: 18375, quantity: 2, product_id: "p-oud" },
    { name: "Musk", price: 10000, quantity: 1, product_id: "p-musk" },
];
const price = 46750;

describe("refundHistory", () => {
    it("counts after_sale_items rows of live refunds", () => {
        const h = refundHistory(items, price, [{ id: "r1", status: "return_pending", items: [] }], [
            { order_id: "r1", original_line_index: 0, qty: 1, amount: 18375 },
        ]);
        expect(h).toEqual([{ index: 0, quantity: 1, amount: 18375 }]);
    });

    it("ignores cancelled and failed refunds", () => {
        const h = refundHistory(
            items,
            price,
            [
                { id: "r1", status: "cancelled", items: [] },
                { id: "r2", status: "refund_failed", items: [{ name: "Musk", price: 10000, quantity: 1, product_id: "p-musk" }] },
            ],
            [{ order_id: "r1", original_line_index: 0, qty: 2, amount: 36750 }],
        );
        expect(h).toEqual([]);
    });

    it("matches an old refund's items to the original lines", () => {
        const h = refundHistory(
            items,
            price,
            [{ id: "old", status: "refund_delivered", items: [{ name: "Oud", price: 18375, quantity: 5, product_id: "p-oud" }] }],
            [],
        );
        // Capped at the 2 units bought.
        expect(h).toEqual([{ index: 0, quantity: 2, amount: 36750 }]);
        const lines = refundableLines(items, price, h);
        expect(lines.map((l) => l.remainingQuantity)).toEqual([0, 1]);
    });
});
