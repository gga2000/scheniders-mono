import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2, productAttributeDefSchema, type SectionInstance } from "@scheniders/shared";
import { applyStoreTemplate, STORE_TEMPLATES, getStoreTemplate } from "../index";
import { CONTENT_PACKS, applyContentPack, packCategoryRows, resolveContentPack, resolvePackHeadings } from "./index";
import { perfumePack } from "./perfume";
import { buildStarterStoreConfigV2, STARTER_TEMPLATES } from "@/lib/starter-store";
import { schenidersSignatureTemplate } from "../scheniders-signature";

type I18nLeaf = { path: string; locale: string; text: string };

/** Every localized string in a pack: any object whose keys are all locale codes. */
function i18nLeaves(value: unknown, path = ""): I18nLeaf[] {
    if (Array.isArray(value)) return value.flatMap((v, i) => i18nLeaves(v, `${path}[${i}]`));
    if (!value || typeof value !== "object" || value instanceof RegExp) return [];
    const entries = Object.entries(value);
    const isI18n = entries.length > 0 && entries.every(([k, v]) => ["ar", "en", "ku"].includes(k) && typeof v === "string");
    if (isI18n) return entries.map(([locale, text]) => ({ path, locale, text: text as string }));
    return entries.flatMap(([k, v]) => i18nLeaves(v, path ? `${path}.${k}` : k));
}

const ARABIC = /[\u0600-\u06FF]/;
/**
 * Latin an Iraqi shopper reads as-is in Arabic copy: brand names, storage
 * and battery units, clothing sizes. `{placeholders}` are stripped first.
 */
const LATIN_IN_ARABIC_OK = new Set(["Apple", "Samsung", "Xiaomi", "mAh", "GB", "TB", "XS", "S", "M", "L", "XL", "XXL"]);
const latinWords = (text: string) =>
    (text.replace(/\{[a-z_]+\}/g, "").match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []).filter((w) => !LATIN_IN_ARABIC_OK.has(w));

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
            expect(p.testimonials, `${p.id} testimonials`).toEqual([]);
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

    it("keeps each language in its own script", () => {
        const leaks: string[] = [];
        for (const p of CONTENT_PACKS) {
            for (const leaf of i18nLeaves(p)) {
                if (leaf.locale === "en" && ARABIC.test(leaf.text)) leaks.push(`${p.id}.${leaf.path}.en: ${leaf.text}`);
                if (leaf.locale === "ar" && latinWords(leaf.text).length) {
                    leaks.push(`${p.id}.${leaf.path}.ar: ${latinWords(leaf.text).join(", ")}`);
                }
            }
        }
        expect(leaks).toEqual([]);
    });

    it("tells the shopper they pay nothing up front, not the store", () => {
        // "ما ندفع" is "we don't pay": the subject is the shopper.
        for (const p of CONTENT_PACKS) {
            for (const leaf of i18nLeaves(p)) {
                if (leaf.locale === "ar") expect(leaf.text, `${p.id}.${leaf.path}`).not.toContain("ما ندفع ولا دينار");
            }
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

    describe("no store but Scheniders' own speaks as Scheniders", () => {
        // Scheniders' brand, address, socials, delivery promise, free-tester
        // and return promises, and its real customers' words. None of it may
        // reach another merchant's store, whatever look and niche they pick.
        const FOREIGN = ["شنايدر", "Scheniders", "Schnieder", "schneider.iraq", "schneiders.iraq", "زيونة", "Zayouna", "تيستر", "tester", "Tester", "18 ساعة", "18 hours", "نورين", "Noreen"];
        const REVIEW_SECTIONS = new Set(["testimonial_cards", "testimonials_carousel"]);

        function leaksIn(cfg: object): string[] {
            const json = JSON.stringify(cfg);
            return FOREIGN.filter((word) => json.includes(word));
        }

        it("the Scheniders template still carries them (the control for this test)", () => {
            const own = applyStoreTemplate(emptyStoreConfigV2(), schenidersSignatureTemplate);
            expect(leaksIn(own).length).toBeGreaterThan(0);
        });

        it("seeds every look × every niche with none of them and no reviews", () => {
            for (const template of STARTER_TEMPLATES) {
                for (const pack of CONTENT_PACKS) {
                    const cfg = buildStarterStoreConfigV2({ templateId: template.id, packId: pack.id, businessName: "متجر الواحة" });
                    expect(leaksIn(cfg), `${template.id} × ${pack.id}`).toEqual([]);
                    for (const page of cfg.pages) {
                        for (const section of page.sections) {
                            if (!REVIEW_SECTIONS.has(section.type)) continue;
                            expect((section.base as { items?: unknown[] }).items ?? [], `${template.id} × ${pack.id} ${page.page_id}/${section.type}`).toEqual([]);
                        }
                    }
                }
            }
        });

        it("seeds a perfume store found by its industry name with none of them", () => {
            for (const industryId of ["عطور", "Perfume & Fragrance"]) {
                const cfg = buildStarterStoreConfigV2({ templateId: "scheniders_signature", industryId, businessName: "Oasis Scents" });
                expect(cfg.template?.pack_id).toBe("perfume");
                expect(leaksIn(cfg), industryId).toEqual([]);
            }
        });

        it("the registry's Signature look carries none of them before any pack is laid on", () => {
            const direction = required(getStoreTemplate("scheniders_signature"), "scheniders_signature");
            expect(leaksIn(applyStoreTemplate(emptyStoreConfigV2(), direction))).toEqual([]);
        });

        it("replaces the Signature section headings with the chosen pack's", () => {
            const cfg = buildStarterStoreConfigV2({ templateId: "scheniders_signature", packId: "coffee", businessName: "بن الرافدين" });
            const home = required(cfg.pages.find((p) => p.page_id === "home"), "home page");
            const pillars = baseOf(required(home.sections.find((s) => s.type === "pillars_grid"), "pillars_grid"));
            expect(pillars.title_i18n).toEqual(resolvePackHeadings(resolveContentPack("coffee")).pillars.title_i18n);
        });
    });
});
