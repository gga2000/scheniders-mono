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
