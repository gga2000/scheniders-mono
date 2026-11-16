import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getContentPack } from "@/lib/store-templates/content-packs";
import {
    ATTRIBUTE_TEMPLATES,
    BUSINESS_TYPE_IDS,
    BUSINESS_TYPES,
    attributeTemplatesFor,
    examplePlaceholder,
    industryIdFor,
    mergeAttributeSets,
    packIdFor,
    variantPresetsFor,
} from "./business-types";

/** The live industries rows the onboarding wizard lists (names as stored). */
const INDUSTRIES = [
    "Fashion & Clothing",
    "Beauty & Cosmetics",
    "Electronics",
    "Food & Beverages",
    "Home & Furniture",
    "Health & Wellness",
    "Sports & Fitness",
    "Jewelry & Accessories",
    "Kids & Baby",
    "Books & Stationery",
    "Automotive",
    "Grocery",
    "Other",
].map((name, i) => ({ id: `ind-${i}`, name, name_ar: null }));

describe("business types («شنو تبيع؟»)", () => {
    it("lists exactly the values the database accepts", () => {
        const sql = readFileSync(
            join(__dirname, "../../../packages/supabase/migrations/20261116202423_b10_tenants_business_types.sql"),
            "utf8",
        );
        const inCheck = [...sql.slice(sql.indexOf("ARRAY[")).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
        expect(inCheck).toEqual([...BUSINESS_TYPE_IDS]);
        expect(BUSINESS_TYPES.map((t) => t.id)).toEqual([...BUSINESS_TYPE_IDS]);
    });

    it("every type starts on a content pack that exists", () => {
        for (const type of BUSINESS_TYPES) expect(getContentPack(type.pack_id), type.id).toBeDefined();
    });

    it("every type finds its row in the onboarding wizard", () => {
        for (const type of BUSINESS_TYPES) expect(industryIdFor([type.id], INDUSTRIES), type.id).not.toBeNull();
        expect(industryIdFor(["clothing"], INDUSTRIES)).toBe("ind-0");
        expect(industryIdFor(["car"], INDUSTRIES)).toBe("ind-10");
        expect(industryIdFor([], INDUSTRIES)).toBeNull();
    });

    it("the first trade ticked picks the pack; unknown values are ignored", () => {
        expect(packIdFor(["perfume", "clothing"])).toBe("perfume");
        expect(packIdFor(["nope", "clothing"])).toBe("fashion");
        expect(packIdFor([])).toBeUndefined();
    });

    it("a clothing shop is shown a shirt, never a perfume, and an older store keeps the form's own words", () => {
        expect(examplePlaceholder(["clothing"], "product_i18n", "ar", "fallback")).toBe("مثال: قميص قطن أبيض");
        expect(examplePlaceholder(["clothing"], "category_i18n", "en", "fallback")).toBe("e.g. Shirts, trousers");
        expect(examplePlaceholder(["clothing"], "category_slug_i18n", "ar", "fallback")).toBe("مثال: shirts");
        expect(examplePlaceholder([], "product_i18n", "ar", "fallback")).toBe("fallback");
        expect(examplePlaceholder(["other"], "attribute_i18n", "en", "fallback")).toBe("fallback");
        for (const type of BUSINESS_TYPES.filter((t) => t.id !== "perfume")) {
            const words = Object.values(type.examples ?? {}).flatMap((s) => Object.values(s));
            expect(words.join(" "), type.id).not.toMatch(/عطر|perfume/i);
        }
    });

    it("a clothing shop gets sizes, shoe sizes and colours as presets; a store that never said gets the generic two", () => {
        expect(variantPresetsFor(["clothing"]).map((p) => p.id)).toEqual(["letter_sizes", "shoe_sizes", "colours"]);
        expect(variantPresetsFor(["clothing", "other"]).map((p) => p.id)).toEqual(["letter_sizes", "shoe_sizes", "colours"]);
        expect(variantPresetsFor([]).map((p) => p.id)).toEqual(["letter_sizes", "colours"]);
        expect(variantPresetsFor(["perfume"])[0].values.map((v) => v.label_i18n.ar)).toEqual(["30 مل", "50 مل", "100 مل"]);
    });

    it("clothing no longer seeds size and colour as filters: they are variants", () => {
        const fashion = getContentPack("fashion");
        expect(fashion?.attributes.map((a) => a.key)).not.toContain("size");
        expect(fashion?.attributes.map((a) => a.key)).not.toContain("color");
    });

    it("the six category templates fit the attribute table's rules", () => {
        expect(ATTRIBUTE_TEMPLATES.map((t) => t.id)).toEqual(["clothing", "furniture", "electronics", "car", "toys", "books"]);
        for (const template of ATTRIBUTE_TEMPLATES) {
            for (const a of template.attributes) {
                expect(a.key, a.key).toMatch(/^[a-z][a-z0-9_]{0,62}$/);
                if (a.kind === "enum") expect(a.options?.length, a.key).toBeGreaterThan(0);
                if (a.kind === "group_list") expect(a.group_keys?.length, a.key).toBeGreaterThan(0);
                if (a.kind === "range") expect((a.range_max ?? 0) > (a.range_min ?? 0), a.key).toBe(true);
                expect(a.name_i18n.ar && a.name_i18n.en, a.key).toBeTruthy();
            }
        }
        const furniture = ATTRIBUTE_TEMPLATES.find((t) => t.id === "furniture");
        expect(furniture?.attributes.find((a) => a.key === "dimensions")?.group_keys?.map((g) => g.key)).toEqual(["length", "width", "height"]);
    });

    it("templates follow the trades ticked, and a key two sets share is written once", () => {
        expect(attributeTemplatesFor(["perfume", "electronics", "clothing"]).map((t) => t.id)).toEqual(["electronics", "clothing"]);
        const merged = mergeAttributeSets(getContentPack("fashion")?.attributes ?? [], ...attributeTemplatesFor(["clothing"]).map((t) => t.attributes));
        expect(merged.map((a) => a.key)).toEqual(["material", "fit", "season", "size_chart"]);
    });
});
