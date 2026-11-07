import { describe, expect, it } from "vitest";
import { isFieldRelevant } from "./section-field-visibility";

const shape = ["title_i18n", "items", "source", "category_slugs", "show_counts"];

describe("isFieldRelevant", () => {
    it("hides the hand-written list when cards come from categories", () => {
        const v = { source: "categories" };
        expect(isFieldRelevant("items", v, shape)).toBe(false);
        expect(isFieldRelevant("category_slugs", v, shape)).toBe(true);
        expect(isFieldRelevant("show_counts", v, shape)).toBe(true);
    });

    it("hides the category picker when cards are hand-written", () => {
        for (const v of [{ source: "config" }, {}]) {
            expect(isFieldRelevant("items", v, shape)).toBe(true);
            expect(isFieldRelevant("category_slugs", v, shape)).toBe(false);
        }
    });

    it("never touches objects without the switch", () => {
        expect(isFieldRelevant("items", {}, ["items", "title_i18n"])).toBe(true);
    });
});

describe("isFieldRelevant — product FAQ", () => {
    const faq = ["items", "product_faq", "contact_style", "heading_style", "compact", "layout"];

    it("hides product-FAQ-only styling on a plain FAQ", () => {
        expect(isFieldRelevant("contact_style", {}, faq)).toBe(false);
        expect(isFieldRelevant("heading_style", {}, faq)).toBe(false);
        expect(isFieldRelevant("items", {}, faq)).toBe(true);
    });

    it("keeps the heading style for the compact layout", () => {
        expect(isFieldRelevant("heading_style", { compact: true }, faq)).toBe(true);
    });

    it("hides the hand-written questions once product questions replace them", () => {
        const v = { product_faq: { items: [] } };
        expect(isFieldRelevant("items", v, faq)).toBe(false);
        expect(isFieldRelevant("contact_style", v, faq)).toBe(true);
    });
});
