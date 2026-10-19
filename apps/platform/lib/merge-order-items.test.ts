import { describe, it, expect } from "vitest";
import type { Order, OrderItem } from "@/types/order";
import { mergeOrderItems } from "./merge-order-items";
import { getItemsDisplay } from "./order-format-utils";
import { generateInvoiceHTML, type EnhancedLabelOptions } from "./enhanced-label-generator";
import { formatOrderRow, formatDeliveryRow } from "./order-export-utils";
import { mapOrderToWaseet } from "./waseet-api";
import type { WaseetCityMapping } from "@/types/waseet";

/**
 * One line of LightFunnels order #7406 exactly as stored (read live
 * 2026-10-19): three of these arrived as three lines of quantity 1.
 */
const ENVOY: OrderItem = {
    sku: "envoy",
    name: "انفوي",
    price: 34750,
    quantity: 1,
    image_url: "https://example.test/envoy.png",
    tag_color: "#22c55e",
    product_id: "6ab3bad7-e4dd-4f18-8c3b-746d095a2c93",
};

function line(overrides: Partial<OrderItem> = {}): OrderItem {
    return { ...ENVOY, ...overrides };
}

const subtotal = (items: readonly OrderItem[]) => items.reduce((sum, i) => sum + i.price * i.quantity, 0);
const units = (items: readonly OrderItem[]) => items.reduce((sum, i) => sum + i.quantity, 0);

describe("mergeOrderItems", () => {
    it("collapses the stored shape: three identical lines of 1 become one line of 3", () => {
        const merged = mergeOrderItems([line(), line(), line()]);
        expect(merged).toEqual([{ ...ENVOY, quantity: 3 }]);
    });

    it("sums the quantities, not the number of lines", () => {
        const merged = mergeOrderItems([line({ quantity: 2 }), line({ quantity: 3 })]);
        expect(merged).toEqual([{ ...ENVOY, quantity: 5 }]);
    });

    it("merges non-adjacent repeats and keeps first-appearance order", () => {
        const other = line({ name: "بيرسيفيرون", sku: "SCHN-PERCIVERON", product_id: "p2", price: 44750 });
        const merged = mergeOrderItems([line(), other, line()]);
        expect(merged.map((i) => [i.name, i.quantity])).toEqual([["انفوي", 2], ["بيرسيفيرون", 1]]);
    });

    it("leaves an already-clean order unchanged", () => {
        const items = [line(), line({ product_id: "p2", sku: "other", name: "Other" })];
        expect(mergeOrderItems(items)).toEqual(items);
    });

    describe("never merges lines that differ", () => {
        const cases: Array<[string, Partial<OrderItem> & Record<string, unknown>]> = [
            ["unit price", { price: 30000 }],
            ["variant", { variant_id: "v2" }],
            ["product", { product_id: "another-product" }],
            ["sku", { sku: "envoy-tester" }],
            ["sku present on only one side", { sku: undefined }],
            ["name", { name: "انفوي 100ml" }],
            ["name by case/padding only", { name: " انفوي " }],
            ["open-box flag", { is_open_box: true }],
            ["tag colour", { tag_color: "#f97316" }],
            ["compare-at price", { compare_at_price: 50000 }],
            ["a note carried on the line", { notes: "gift wrap" }],
        ];
        for (const [what, overrides] of cases) {
            it(what, () => {
                const merged = mergeOrderItems([line(), { ...line(), ...overrides }]);
                expect(merged).toHaveLength(2);
                expect(merged.map((i) => i.quantity)).toEqual([1, 1]);
            });
        }

        it("two variants of one product", () => {
            const merged = mergeOrderItems([line({ variant_id: "v1" }), line({ variant_id: "v2" })]);
            expect(merged).toHaveLength(2);
        });
    });

    it("treats an absent field and an explicit null as the same, regardless of key order", () => {
        const withNull = { quantity: 1, variant_id: null, name: "انفوي", price: 34750 };
        const without = { price: 34750, name: "انفوي", quantity: 2 };
        const merged = mergeOrderItems<{ quantity: number; name: string; price: number; variant_id?: string | null }>([withNull, without]);
        expect(merged).toHaveLength(1);
        expect(merged[0].quantity).toBe(3);
    });

    it("passes a line with no usable quantity through instead of inventing one", () => {
        const broken = { name: "انفوي", price: 34750, quantity: null };
        const merged = mergeOrderItems<{ name: string; price: number; quantity: number | null }>([
            broken,
            { name: "انفوي", price: 34750, quantity: 1 },
            { ...broken },
            { name: "انفوي", price: 34750, quantity: 1 },
        ]);
        expect(merged.map((i) => i.quantity)).toEqual([null, 2, null]);
    });

    it("does not mutate the input array or its lines", () => {
        const original = [Object.freeze(line()), Object.freeze(line()), Object.freeze(line({ price: 1 }))];
        const snapshot = structuredClone(original);
        const merged = mergeOrderItems(original);
        expect(original).toEqual(snapshot);
        expect(merged).not.toBe(original);
        expect(merged[0]).not.toBe(original[0]);
    });

    it("handles empty, single and missing input", () => {
        expect(mergeOrderItems([])).toEqual([]);
        expect(mergeOrderItems(null)).toEqual([]);
        expect(mergeOrderItems(undefined)).toEqual([]);
        expect(mergeOrderItems([line()])).toEqual([line()]);
    });
});

describe("totals are unchanged by merging", () => {
    /** Deterministic PRNG so a failure reproduces. */
    function rng(seed: number) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) % 2147483648;
            return s / 2147483648;
        };
    }

    it("Σ price × quantity and Σ quantity survive 500 random orders with repeats", () => {
        const next = rng(42);
        const catalogue: OrderItem[] = [
            line(),
            line({ price: 30000 }),
            line({ variant_id: "v2" }),
            line({ name: "بيرسيفيرون", sku: "SCHN-PERCIVERON", product_id: "p2", price: 44750 }),
            line({ is_open_box: true, price: 29999.5 }),
        ];
        for (let n = 0; n < 500; n++) {
            const count = 1 + Math.floor(next() * 8);
            const items = Array.from({ length: count }, () => ({
                ...catalogue[Math.floor(next() * catalogue.length)],
                quantity: 1 + Math.floor(next() * 4),
            }));
            const merged = mergeOrderItems(items);
            expect(subtotal(merged)).toBe(subtotal(items));
            expect(units(merged)).toBe(units(items));
            expect(merged.length).toBeLessThanOrEqual(catalogue.length);
        }
    });

    it("matches the stored order total for live order #7406 (3 × 34,750 = 104,250)", () => {
        const items = [line(), line(), line()];
        const merged = mergeOrderItems(items);
        expect(subtotal(merged)).toBe(104250);
        expect(subtotal(merged)).toBe(subtotal(items));
    });
});

function makeOrder(items: OrderItem[]): Order {
    return {
        id: "00000000-0000-4000-8000-000000007406",
        created_at: "2026-09-12T17:25:48.656Z",
        order_id: "7406",
        customer_name: "زبون تجريبي",
        phone: "07702770786",
        city: "بغداد",
        governorate_code: "BGD",
        address_details: "الكرادة",
        items,
        price: 104250,
        delivery_fee: 5000,
        discount_amount: 0,
        status: "confirmed",
        priority: "normal",
        payment_status: "cod",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        source: "lightfunnels",
    };
}

describe("display, print and export surfaces show one line × 3", () => {
    const split = makeOrder([line(), line(), line()]);
    const clean = makeOrder([line({ quantity: 3 })]);

    it("order cards (getItemsDisplay)", () => {
        const display = getItemsDisplay(split.items);
        expect(display).toHaveLength(1);
        expect(display[0]).toMatchObject({ name: "انفوي", quantity: 3 });
    });

    it("invoice prints one row and the same totals as a clean order", () => {
        const options: EnhancedLabelOptions = {
            size: "a5",
            showPrice: true,
            isGift: false,
            showQrCode: false,
            showBarcode: false,
            showCompanyLogo: false,
            showDeliveryLogo: false,
        };
        const html = generateInvoiceHTML(split, options);
        expect(html.match(/<td>انفوي<\/td>/g)).toHaveLength(1);
        expect(html).toBe(generateInvoiceHTML(clean, options));
    });

    it("CSV / Excel and courier export rows", () => {
        expect(formatOrderRow(split)).toEqual(formatOrderRow(clean));
        expect(formatOrderRow(split)[5]).toBe("انفوي x3");
        expect(formatDeliveryRow(split, 0)).toEqual(formatDeliveryRow(clean, 0));
    });

    it("Al-Waseet payload names the product once and keeps count and price", () => {
        const mappings: WaseetCityMapping[] = [{
            id: "m1",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            governorate_code: "BGD",
            governorate_name_ar: "بغداد",
            waseet_city_id: 1,
            waseet_city_name: "Baghdad",
            waseet_default_region_id: 10,
            waseet_default_region_name: "Karrada",
            is_active: true,
        }];
        const fromSplit = mapOrderToWaseet(split, mappings, 1);
        const fromClean = mapOrderToWaseet(clean, mappings, 1);
        expect(fromSplit).toEqual(fromClean);
        expect(fromSplit.success).toBe(true);
        expect(fromSplit.data).toMatchObject({ type_name: "انفوي", items_number: 3, price: 109250 });
    });
});
