import { describe, expect, it } from "vitest";
import { fillMessageTemplate } from "./fill-message-template";
import { SETTINGS_SAMPLE_ORDER } from "./settings-sample-order";
import type { Order } from "@/lib/supabase";

const opts = { discountPercent: 10, customPrice: null };

describe("fillMessageTemplate", () => {
    it("fills the order's details into every placeholder it names", () => {
        const text = fillMessageTemplate("هلا {customer_name}، طلبك رقم {sequence_number}: {product} من {city}", SETTINGS_SAMPLE_ORDER, opts);
        expect(text).toBe("هلا أحمد علي، طلبك رقم 4821: عطر ليالي 100 مل من البصرة");
    });

    it("joins several products and counts pieces", () => {
        const order: Order = {
            ...SETTINGS_SAMPLE_ORDER,
            items: [
                { name: "أ", quantity: 2, price: 1000 },
                { name: "ب", quantity: 1, price: 1000 },
            ],
        };
        expect(fillMessageTemplate("{products} · {items_count}", order, opts)).toBe("أ + ب · 3");
    });

    it("takes the offer price from the percent, or the typed price when there is one", () => {
        const byPercent = fillMessageTemplate("{discount_percent} {discounted_price}", SETTINGS_SAMPLE_ORDER, opts);
        const typed = fillMessageTemplate("{discounted_price}", SETTINGS_SAMPLE_ORDER, { discountPercent: 10, customPrice: 30000 });
        expect(byPercent.startsWith("10 ")).toBe(true);
        expect(byPercent).toContain("28,800");
        expect(typed).toContain("30,000");
    });

    it("uses the products' own discount when they carry a compare-at price", () => {
        const order: Order = { ...SETTINGS_SAMPLE_ORDER, price: 30000, items: [{ name: "x", quantity: 1, price: 30000, compare_at_price: 40000 }] };
        expect(fillMessageTemplate("{discount_percent}", order, opts)).toBe("25");
    });

    it("turns emoji shortcodes into emoji", () => {
        expect(fillMessageTemplate("{e:heart}", SETTINGS_SAMPLE_ORDER, opts)).not.toContain("{e:");
    });
});
