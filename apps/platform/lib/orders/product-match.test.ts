import { describe, it, expect } from "vitest";
import type { Order } from "@/types/order";
import { countProductsInView, orderMatchesProduct } from "./product-match";

const o = (...names: string[]) => ({ items: names.map((name) => ({ name, quantity: 1, price: 1 })) }) as unknown as Pick<Order, "items">;

describe("product chips count with the filter's own rule", () => {
    const rows = [
        o("X"),
        o("X Y"),
        o("x"),
        o("X "),
        o("X", "X"),          // duplicate line items: counted once
        o("X Y", "Z"),
        o("Z"),
        o(),
        { items: undefined } as unknown as Pick<Order, "items">,
    ];

    it("every chip's count is the length of the list it opens", () => {
        const chips = countProductsInView(rows);
        expect(chips.map((c) => c.name).sort()).toEqual(["X", "X ", "X Y", "Z", "x"].sort());
        for (const chip of chips) {
            expect({ name: chip.name, count: chip.count })
                .toEqual({ name: chip.name, count: rows.filter((r) => orderMatchesProduct(r, chip.name)).length });
        }
    });

    it("sorts by count, then name", () => {
        const chips = countProductsInView(rows);
        for (let i = 1; i < chips.length; i++) {
            const a = chips[i - 1];
            const b = chips[i];
            expect(a.count > b.count || (a.count === b.count && a.name.localeCompare(b.name) <= 0)).toBe(true);
        }
    });

    it("matches case-insensitively by substring", () => {
        expect(orderMatchesProduct(o("Red Shirt"), "shirt")).toBe(true);
        expect(orderMatchesProduct(o("Red Shirt"), "hat")).toBe(false);
        expect(orderMatchesProduct({ items: undefined } as unknown as Pick<Order, "items">, "x")).toBe(false);
    });
});
