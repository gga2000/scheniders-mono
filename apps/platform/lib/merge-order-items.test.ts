import { describe, it, expect } from "vitest";
import type { OrderItem } from "@/types/order";
import { mergeOrderItems, hasDuplicateItems } from "./merge-order-items";

function item(overrides: Partial<OrderItem> = {}): OrderItem {
    return { name: "بيرسيفيرون", quantity: 1, price: 44750, ...overrides } as OrderItem;
}

describe("mergeOrderItems", () => {
    it("collapses the real case: three units arriving as three lines", () => {
        // Order #7399 — LightFunnels sent three entries, each quantity 1.
        const merged = mergeOrderItems([item(), item(), item()]);
        expect(merged).toHaveLength(1);
        expect(merged[0].quantity).toBe(3);
        expect(merged[0].name).toBe("بيرسيفيرون");
    });

    it("sums quantities rather than counting lines", () => {
        const merged = mergeOrderItems([item({ quantity: 2 }), item({ quantity: 3 })]);
        expect(merged[0].quantity).toBe(5);
    });

    it("keeps genuinely different products apart", () => {
        const merged = mergeOrderItems([item(), item({ name: "انفوي", price: 34750 })]);
        expect(merged).toHaveLength(2);
    });

    it("does not merge the same product sold at two different prices", () => {
        // A bump or a one-unit discount is a real second line; collapsing it would
        // misstate what the customer agreed to pay.
        const merged = mergeOrderItems([item({ price: 44750 }), item({ price: 30000 })]);
        expect(merged).toHaveLength(2);
    });

    it("matches on variant before falling back to name", () => {
        const a = item({ name: "عطر", variant_id: "v1" });
        const b = item({ name: "عطر مختلف الاسم", variant_id: "v1" });
        expect(mergeOrderItems([a, b])).toHaveLength(1);
    });

    it("treats different variants of one product as separate lines", () => {
        const merged = mergeOrderItems([
            item({ product_id: "p1", variant_id: "v1" }),
            item({ product_id: "p1", variant_id: "v2" }),
        ]);
        expect(merged).toHaveLength(2);
    });

    it("ignores case and padding in the name fallback", () => {
        const merged = mergeOrderItems([item({ name: "Envoy" }), item({ name: " envoy " })]);
        expect(merged).toHaveLength(1);
    });

    it("keeps an open-box unit distinct from a sealed one", () => {
        const merged = mergeOrderItems([item(), item({ is_open_box: true })]);
        expect(merged).toHaveLength(2);
    });

    it("fills missing metadata from a later duplicate", () => {
        const merged = mergeOrderItems([
            item({ image_url: undefined, sku: undefined }),
            item({ image_url: "https://x/img.png", sku: "SCHN-PERCIVERON" }),
        ]);
        expect(merged[0].image_url).toBe("https://x/img.png");
        expect(merged[0].sku).toBe("SCHN-PERCIVERON");
    });

    it("never mutates the caller's array", () => {
        const original = [item(), item()];
        const snapshot = JSON.parse(JSON.stringify(original));
        mergeOrderItems(original);
        expect(original).toEqual(snapshot);
    });

    it("handles empty, single and missing input", () => {
        expect(mergeOrderItems([])).toEqual([]);
        expect(mergeOrderItems(null)).toEqual([]);
        expect(mergeOrderItems(undefined)).toEqual([]);
        expect(mergeOrderItems([item()])).toHaveLength(1);
    });

    it("defaults a missing quantity to one rather than zero", () => {
        const merged = mergeOrderItems([
            item({ quantity: undefined as unknown as number }),
            item({ quantity: undefined as unknown as number }),
        ]);
        expect(merged[0].quantity).toBe(2);
    });
});

describe("hasDuplicateItems", () => {
    it("spots a splittable order", () => {
        expect(hasDuplicateItems([item(), item()])).toBe(true);
    });

    it("is false for an already-clean order", () => {
        expect(hasDuplicateItems([item(), item({ name: "انفوي" })])).toBe(false);
        expect(hasDuplicateItems([item()])).toBe(false);
        expect(hasDuplicateItems(null)).toBe(false);
    });
});

describe("getItemsDisplay merges for the card", () => {
    it("shows one line of ×3 for order #7399's three identical entries", async () => {
        const { getItemsDisplay } = await import("./order-format-utils");
        const display = getItemsDisplay([
            { name: "بيرسيفيرون", quantity: 1, price: 44750 },
            { name: "بيرسيفيرون", quantity: 1, price: 44750 },
            { name: "بيرسيفيرون", quantity: 1, price: 44750 },
        ]);
        expect(display).toHaveLength(1);
        expect(display[0]).toMatchObject({ name: "بيرسيفيرون", quantity: 3 });
    });

    it("leaves a genuinely mixed order alone", async () => {
        const { getItemsDisplay } = await import("./order-format-utils");
        const display = getItemsDisplay([
            { name: "بيرسيفيرون", quantity: 1, price: 44750 },
            { name: "انفوي", quantity: 2, price: 34750 },
        ]);
        expect(display.map(d => [d.name, d.quantity])).toEqual([["بيرسيفيرون", 1], ["انفوي", 2]]);
    });
});
