import { describe, expect, it } from "vitest";
import { labelBrandFromSettings } from "./use-label-brand";

const linked = { primeLinked: true, shopLogo: "data:image/png;base64,AAAA" };

describe("labelBrandFromSettings", () => {
    it("prints nothing extra for a shop that switched nothing on", () => {
        expect(labelBrandFromSettings({}, { primeLinked: false, shopLogo: null })).toEqual({
            primeLogo: false,
            shopLogo: null,
            fragileWarning: false,
            noOpen: null,
            customerNote: "",
        });
    });

    it("uses the default no-opening words until the shop types its own", () => {
        expect(labelBrandFromSettings({ no_open_warning: true }, linked).noOpen).toEqual({ text: "يمنع فتح الطرد منعاً باتاً", subtext: "" });
        expect(labelBrandFromSettings({ no_open_warning: true, no_open_text: "  يمنع فتح العطر ", no_open_subtext: "الفحص بالعينة" }, linked).noOpen).toEqual({
            text: "يمنع فتح العطر",
            subtext: "الفحص بالعينة",
        });
        expect(labelBrandFromSettings({ no_open_warning: false, no_open_text: "x" }, linked).noOpen).toBeNull();
    });

    it("cuts saved text to what Settings allows, so the label keeps its lines", () => {
        const brand = labelBrandFromSettings({ customer_note: "ب".repeat(200), no_open_warning: true, no_open_text: "ا".repeat(80) }, linked);
        expect(brand.customerNote).toHaveLength(55);
        expect(brand.noOpen?.text).toHaveLength(40);
    });

    it("prints the shop logo only when the shop switched it on", () => {
        expect(labelBrandFromSettings({ shop_logo: true }, linked).shopLogo).toBe(linked.shopLogo);
        expect(labelBrandFromSettings({ shop_logo: false }, linked).shopLogo).toBeNull();
    });
});
