import { describe, expect, it } from "vitest";
import { summarizeArrayItem } from "./auto-form-fields";

describe("summarizeArrayItem — repeater row titles", () => {
    it("uses the merchant's own words", () => {
        expect(summarizeArrayItem({ title_i18n: { ar: "عطور رجالية", en: "Men" } }, "ar")).toBe("عطور رجالية");
        expect(summarizeArrayItem({ author_name: "Ali" }, "ar")).toBe("Ali");
    });

    it("never shows links, paths or slugs as a row title", () => {
        expect(summarizeArrayItem("https://cdn.example.com/a.jpg", "ar")).toBeNull();
        expect(summarizeArrayItem("summer-sale", "ar")).toBeNull();
        expect(summarizeArrayItem({ label: "/collections/men" }, "ar")).toBeNull();
        expect(summarizeArrayItem({ name: "best_sellers" }, "ar")).toBeNull();
    });

    it("skips a slug key and keeps looking for readable text", () => {
        expect(summarizeArrayItem({ title_i18n: { en: "men-perfume" }, name: "Men perfume" }, "en")).toBe("Men perfume");
    });
});
