import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2, productAttributeDefSchema, type SectionInstance } from "@scheniders/shared";
import { applyStoreTemplate, STORE_TEMPLATES, getStoreTemplate } from "../index";
import { CONTENT_PACKS, applyContentPack, packCategoryRows, resolveContentPack } from "./index";
import { perfumePack } from "./perfume";

const i18nOk = (v: unknown) => !!v && typeof v === "object" && Object.values(v as object).some((s) => typeof s === "string" && s.trim());

/** Fails the test with a name instead of a TypeError when a lookup misses. */
function required<T>(value: T | undefined, what: string): T {
    if (value === undefined) throw new Error(`missing: ${what}`);
    return value;
}

function baseOf(section: SectionInstance): Record<string, unknown> {
    return section.base as Record<string, unknown>;
}

describe("content packs", () => {
    it("ships eight packs with unique ids and a general fallback", () => {
        expect(CONTENT_PACKS.map((p) => p.id).sort()).toEqual(["beauty", "coffee", "electronics", "fashion", "food", "general", "perfume", "services"]);
        expect(resolveContentPack(undefined).id).toBe("general");
        expect(resolveContentPack("nonsense").id).toBe("general");
    });

    it("resolves the wizard's industry names, slugs and Arabic names", () => {
        expect(resolveContentPack("Beauty & Cosmetics").id).toBe("beauty");
        expect(resolveContentPack("beauty").id).toBe("beauty");
        expect(resolveContentPack("أزياء وملابس").id).toBe("fashion");
        expect(resolveContentPack("Food & Beverages").id).toBe("food");
        expect(resolveContentPack("Grocery").id).toBe("food");
        expect(resolveContentPack("Electronics").id).toBe("electronics");
        expect(resolveContentPack("عطور").id).toBe("perfume");
    });

    it("every pack is complete, honest, and seeds a valid taxonomy", () => {
        for (const p of CONTENT_PACKS) {
            expect(i18nOk(p.hero.headline_i18n), `${p.id} hero`).toBe(true);
            expect(p.pillars).toHaveLength(3);
            expect(p.trust).toHaveLength(4);
            expect(p.faq.length).toBeGreaterThan(0);
            expect(p.pdp_policies.length).toBeGreaterThan(0);
            // No invented social proof: only the merchant's own words.
            if (p.id !== "perfume") expect(p.testimonials).toEqual([]);
            // Tiles link to categories the pack actually seeds.
            const slugs = new Set(p.categories.map((c) => c.slug));
            expect(slugs.size).toBe(p.categories.length);
            for (const c of [...p.spotlights, ...p.collections]) expect(slugs.has(c.slug), `${p.id}:${c.slug}`).toBe(true);
            // Attribute defs parse under the storefront's own schema.
            const keys = new Set<string>();
            for (const a of p.attributes) {
                expect(keys.has(a.key), `${p.id}:${a.key} duplicate`).toBe(false);
                keys.add(a.key);
                const parsed = productAttributeDefSchema.safeParse({ id: "x", ...a });
                expect(parsed.success, `${p.id}:${a.key} ${JSON.stringify(parsed.success ? "" : parsed.error.issues[0])}`).toBe(true);
            }
            expect(packCategoryRows(p).every((r) => r.name && r.slug)).toBe(true);
        }
    });

    it("overlays a pack onto a generic direction: copy changes, structure stays", () => {
        const kinetic = required(getStoreTemplate("kinetic_ink"), "kinetic_ink");
        const before = applyStoreTemplate(emptyStoreConfigV2(), kinetic);
        const cfg = applyStoreTemplate(emptyStoreConfigV2(), kinetic);
        applyContentPack(cfg, resolveContentPack("coffee"));
        const home = required(cfg.pages.find((p) => p.page_id === "home"), "home page");
        const homeBefore = required(before.pages.find((p) => p.page_id === "home"), "home page before");
        expect(home.sections.map((s) => s.type)).toEqual(homeBefore.sections.map((s) => s.type));
        const hero = baseOf(required(home.sections.find((s) => s.type === "hero_image"), "hero_image"));
        const heroBefore = baseOf(required(homeBefore.sections.find((s) => s.type === "hero_image"), "hero_image before"));
        expect(hero.title_i18n).toEqual(resolveContentPack("coffee").hero.headline_i18n);
        expect(hero.image_url).toEqual(heroBefore.image_url);
        // Fabricated social proof is gone.
        const reviews = home.sections.find((s) => s.type === "testimonials_carousel");
        if (reviews) expect((reviews.base as { items: unknown[] }).items).toEqual([]);
    });

    it("overlays onto the signature direction too (every direction takes every pack)", () => {
        for (const direction of STORE_TEMPLATES) {
            for (const pack of CONTENT_PACKS) {
                const cfg = applyStoreTemplate(emptyStoreConfigV2(), direction);
                expect(() => applyContentPack(cfg, pack)).not.toThrow();
            }
        }
        const cfg = applyStoreTemplate(
            emptyStoreConfigV2(),
            required(getStoreTemplate("scheniders_signature"), "scheniders_signature"),
        );
        applyContentPack(cfg, resolveContentPack("fashion"));
        const product = required(cfg.pages.find((p) => p.page_id === "product"), "product page");
        const pdp = baseOf(required(product.sections.find((s) => s.type === "pdp_direct_order"), "pdp_direct_order"));
        expect(pdp.delivery_sla_i18n).toEqual(resolveContentPack("fashion").delivery.sla_i18n);
        expect(JSON.stringify(cfg)).not.toContain(perfumePack.hero.headline_i18n.ar);
    });
});
