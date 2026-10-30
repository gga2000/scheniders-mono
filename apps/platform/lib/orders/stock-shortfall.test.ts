import { describe, expect, it } from "vitest";
import type { Order } from "@/types/order";
import type { Product } from "@/types/product";
import { findStockShortfalls } from "./stock-shortfall";

const product = (over: Partial<Product>): Product => ({
    id: "fusion", name: "Fusion", stock_quantity: 3, reserved_quantity: 1, open_box_quantity: 1,
    is_filler: false, is_supply: false, ...over,
} as Product);

const order = (over: Partial<Order>): Order => ({
    id: "o1", status: "contacted", is_return: false,
    items: [{ name: "Fusion", quantity: 1, price: 36750, product_id: "fusion" }], ...over,
} as Order);

describe("findStockShortfalls", () => {
    it("passes when what is left covers the order", () => {
        expect(findStockShortfalls([order({ items: [{ name: "Fusion", quantity: 2, price: 1, product_id: "fusion" }] })], [product({})])).toEqual([]);
    });

    it("flags new stock beyond on hand minus confirmed", () => {
        const got = findStockShortfalls([order({ items: [{ name: "Fusion", quantity: 3, price: 1, product_id: "fusion" }] })], [product({})]);
        expect(got).toEqual([{ key: "fusion:new", name: "Fusion", isOpenBox: false, need: 3, left: 2 }]);
    });

    it("sums the same product across a bulk confirm, and checks open box on its own pile", () => {
        const got = findStockShortfalls([
            order({ id: "a", items: [{ name: "Fusion", quantity: 1, price: 1, product_id: "fusion", is_open_box: true }] }),
            order({ id: "b", items: [{ name: "Fusion", quantity: 1, price: 1, product_id: "fusion", is_open_box: true }] }),
        ], [product({})]);
        expect(got).toEqual([{ key: "fusion:ob", name: "Fusion", isOpenBox: true, need: 2, left: 1 }]);
    });

    it("an already oversold product warns on any new confirm", () => {
        const got = findStockShortfalls([order({})], [product({ stock_quantity: -84, reserved_quantity: 10 })]);
        expect(got[0]).toMatchObject({ need: 1, left: -94 });
    });

    it("skips orders that already hold stock, returns, filler and unlinked lines", () => {
        const big = [{ name: "Fusion", quantity: 99, price: 1, product_id: "fusion" }];
        expect(findStockShortfalls([order({ status: "confirmed", items: big })], [product({})])).toEqual([]);
        expect(findStockShortfalls([order({ status: "in_transit", items: big })], [product({})])).toEqual([]);
        expect(findStockShortfalls([order({ is_return: true, items: big })], [product({})])).toEqual([]);
        expect(findStockShortfalls([order({ items: big })], [product({ is_filler: true })])).toEqual([]);
        expect(findStockShortfalls([order({ items: [{ name: "x", quantity: 99, price: 1 }] })], [product({})])).toEqual([]);
    });

    it("checks a variant line against the variant's stock", () => {
        const p = product({ variants: [{ id: "v50", product_id: "fusion", name: "50ml", stock_quantity: 1, reserved_quantity: 1 } as never] });
        const got = findStockShortfalls([order({ items: [{ name: "Fusion", quantity: 1, price: 1, product_id: "fusion", variant_id: "v50" }] })], [p]);
        expect(got).toEqual([{ key: "v50:new", name: "Fusion · 50ml", isOpenBox: false, need: 1, left: 0 }]);
    });
});
