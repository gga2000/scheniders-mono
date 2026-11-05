import { describe, expect, it } from "vitest";
import {
    addPartPayment,
    addToCart,
    changeInNotes,
    findByCode,
    isLow,
    finishPayment,
    leftToPay,
    maxDiscount,
    discountGiven,
    setLinePrice,
    onShelf,
    parseDinars,
    setQuantity,
    subtotalOf,
    type TillProduct,
} from "./cart";

const envoy: TillProduct = {
    id: "p1",
    name: "Envoy",
    price: 45_000,
    image_url: null,
    tag_color: null,
    barcode: "111",
    sku: "ENV",
    available: 21,
    on_hand: 21,
    low_at: 5,
    notes: [],
    variants: [
        { id: "v30", name: "30 ml", price: 10_000, barcode: "11130", sku: null, available: 5, on_hand: 5 },
        { id: "v100", name: "100 ml", price: 45_000, barcode: "111100", sku: null, available: 16, on_hand: 16 },
    ],
};
const bag: TillProduct = { id: "p2", name: "Gift bag", price: 2_000, image_url: null, tag_color: null, barcode: "222", sku: null, available: 40, on_hand: 40, low_at: 5, notes: [], variants: [] };

describe("cart", () => {
    it("adds, stacks the same line, and totals", () => {
        let cart = addToCart([], envoy, envoy.variants[1]);
        cart = addToCart(cart, envoy, envoy.variants[1]);
        cart = addToCart(cart, bag, null);
        expect(cart).toHaveLength(2);
        expect(cart[0]).toMatchObject({ key: "p1:v100", quantity: 2, price: 45_000, variant_name: "100 ml" });
        expect(subtotalOf(cart)).toBe(92_000);
    });

    it("drops a line at 0 and caps at 999", () => {
        const cart = addToCart([], bag, null);
        expect(setQuantity(cart, "p2", 0)).toEqual([]);
        expect(setQuantity(cart, "p2", 5000)[0].quantity).toBe(999);
    });

    it("finds a size by its barcode, and asks for a size when a product has several", () => {
        expect(findByCode([envoy, bag], "11130")).toMatchObject({ product: { id: "p1" }, variant: { id: "v30" } });
        expect(findByCode([envoy, bag], "env")).toMatchObject({ product: { id: "p1" }, variant: null });
        expect(findByCode([envoy, bag], "222")).toMatchObject({ product: { id: "p2" }, variant: null });
        expect(findByCode([envoy, bag], "999")).toBeNull();
    });

    it("limits a cashier's discount unless a manager or no limit", () => {
        expect(maxDiscount(137_000, 10, false)).toBe(13_700);
        expect(maxDiscount(137_000, 10, true)).toBeNull();
        expect(maxDiscount(137_000, null, false)).toBeNull();
    });
});

describe("line price", () => {
    it("cuts a line within its catalog price and counts the cut as discount", () => {
        let cart = addToCart(addToCart([], bag, null), bag, null);
        cart = setLinePrice(cart, "p2", 1_500);
        expect(cart[0]).toMatchObject({ price: 1_500, list_price: 2_000 });
        expect(subtotalOf(cart)).toBe(3_000);
        expect(discountGiven(cart, 500)).toBe(1_500);
    });
    it("never sells above the catalog price or below zero", () => {
        const cart = addToCart([], bag, null);
        expect(setLinePrice(cart, "p2", 9_000)[0].price).toBe(2_000);
        expect(setLinePrice(cart, "p2", -5)[0].price).toBe(0);
    });
});

describe("onShelf", () => {
    it("counts the cart's own pieces out of what is left", () => {
        const cart = addToCart(addToCart(addToCart([], envoy, envoy.variants[0]), envoy, envoy.variants[0]), bag, null);
        const [e, b] = onShelf([envoy, bag], cart);
        expect(e.available).toBe(19);
        expect(e.variants.map((v) => v.available)).toEqual([3, 16]);
        expect(b.available).toBe(39);
    });
    it("returns the same list when the cart is empty", () => {
        const list = [envoy];
        expect(onShelf(list, [])).toBe(list);
    });
});

describe("isLow", () => {
    it("is low at or under the minimum, but not when sold out or with no minimum", () => {
        expect(isLow({ available: 5, low_at: 5 })).toBe(true);
        expect(isLow({ available: 6, low_at: 5 })).toBe(false);
        expect(isLow({ available: 0, low_at: 5 })).toBe(false);
        expect(isLow({ available: 1, low_at: 0 })).toBe(false);
    });
});

describe("payment", () => {
    it("gives change in the fewest notes", () => {
        expect(changeInNotes(13_000)).toEqual([
            { note: 10_000, count: 1 },
            { note: 1_000, count: 3 },
        ]);
        expect(changeInNotes(0)).toEqual([]);
    });

    it("finishes in cash with change, or says how much is short", () => {
        expect(finishPayment(137_000, [], "cash", 150_000)).toEqual({
            ok: true,
            payments: [{ method: "cash", amount: 137_000, tendered: 150_000 }],
            change: 13_000,
        });
        expect(finishPayment(137_000, [], "cash", 100_000)).toEqual({ ok: false, short: 37_000 });
    });

    it("splits: part on card, rest in cash", () => {
        const lines = addPartPayment(137_000, [], "card", 100_000);
        expect(leftToPay(137_000, lines)).toBe(37_000);
        const done = finishPayment(137_000, lines, "cash", 40_000);
        expect(done).toEqual({
            ok: true,
            payments: [
                { method: "card", amount: 100_000 },
                { method: "cash", amount: 37_000, tendered: 40_000 },
            ],
            change: 3_000,
        });
    });

    it("never splits off more than is left", () => {
        expect(addPartPayment(10_000, [], "fib", 25_000)).toEqual([{ method: "fib", amount: 10_000 }]);
    });

    it("reads typed dinars", () => {
        expect(parseDinars("150,000")).toBe(150_000);
        expect(parseDinars("12a")).toBe(0);
    });
});
