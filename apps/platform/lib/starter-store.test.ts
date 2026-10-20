import { describe, expect, it } from "vitest";
import { buildStarterStoreConfigV2, recommendedTemplateForVertical, STARTER_TEMPLATES, STARTER_VERTICALS, starterTaxonomy } from "./starter-store";

const FIRST = STARTER_TEMPLATES[0];

describe("buildStarterStoreConfigV2", () => {
    it("returns a valid v2 config with all 16 default pages", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "Audit Test Store",
        });
        expect(cfg.schema_version).toBe(2);
        expect(cfg.pages).toHaveLength(16);
    });

    it("seeds the home page from the chosen template", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "Audit Test Store",
        });
        const home = cfg.pages.find((p) => p.page_id === "home");
        expect(home?.sections.length).toBe((FIRST.pages.home ?? []).length);
        expect(home!.sections.length).toBeGreaterThan(0);
    });

    it("rehashes template section ids (no placeholders leak through)", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        const home = cfg.pages.find((p) => p.page_id === "home");
        for (const s of home!.sections) {
            expect(s.id).not.toMatch(/^__/);
        }
    });

    it("sets the brand name and a valid brand colour", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "  Audit Test Store  ",
            brandColor: "#1e90ff",
        });
        expect(cfg.brand_kit.identity.name).toBe("Audit Test Store");
        expect(cfg.brand_kit.colors.primary).toBe("#1e90ff");
    });

    it("sets the logo url when provided", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
            logoUrl: "https://cdn.example.com/logo.png",
        });
        expect(cfg.brand_kit.identity.logo_url).toBe(
            "https://cdn.example.com/logo.png",
        );
    });

    it("leaves logo_url unset when no logo is given", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        expect(cfg.brand_kit.identity.logo_url).toBeUndefined();
    });

    it("ignores an invalid brand colour", () => {
        const empty = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
            brandColor: "not-a-hex",
        });
        expect(cfg.brand_kit.colors.primary).toBe(empty.brand_kit.colors.primary);
    });

    it("defaults to Arabic when no locales are given", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        expect(cfg.default_locale).toBe("ar");
        expect(cfg.enabled_locales).toEqual(["ar"]);
    });

    it("enables WhatsApp ordering when a number is provided", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
            whatsappNumber: " 07701234567 ",
        });
        expect(cfg.commerce?.whatsapp_number).toBe("07701234567");
        expect(cfg.commerce?.enable_whatsapp_order).toBe(true);
    });

    it("seeds the policy pages so ad-compliance health checks pass", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        for (const id of [
            "policy_shipping",
            "policy_returns",
            "policy_privacy",
            "policy_terms",
        ] as const) {
            const page = cfg.pages.find((p) => p.page_id === id);
            expect(page?.sections.length).toBeGreaterThan(0);
            expect(page?.sections[0].type).toBe("policy_content");
        }
    });

    it("seeds about + faq pages with content", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        const about = cfg.pages.find((p) => p.page_id === "about");
        const faq = cfg.pages.find((p) => p.page_id === "faq");
        expect(about?.sections.length).toBeGreaterThan(0);
        expect(faq?.sections.length).toBeGreaterThan(0);
    });

    it("gives every seeded section a fresh non-placeholder id", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        const ids = cfg.pages.flatMap((p) => p.sections.map((s) => s.id));
        expect(new Set(ids).size).toBe(ids.length); // all unique
        for (const id of ids) expect(id).not.toMatch(/^__/);
    });

    it("seeds a delivery default_rate when a fee is given", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
            deliveryFeeIqd: 5000,
            freeDeliveryThresholdIqd: 50000,
        });
        expect(cfg.commerce?.shipping?.default_rate).toEqual({
            fee_iqd: 5000,
            free_threshold_iqd: 50000,
        });
    });

    it("omits the free threshold when not given / ≤ 0", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
            deliveryFeeIqd: 4000,
            freeDeliveryThresholdIqd: 0,
        });
        expect(cfg.commerce?.shipping?.default_rate).toEqual({ fee_iqd: 4000 });
    });

    it("seeds no shipping when the fee is absent or non-positive", () => {
        const none = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        const zero = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
            deliveryFeeIqd: 0,
        });
        expect(none.commerce?.shipping).toBeUndefined();
        expect(zero.commerce?.shipping).toBeUndefined();
    });

    it("keeps whatsapp + shipping together on commerce", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
            whatsappNumber: "07701234567",
            deliveryFeeIqd: 3000,
        });
        expect(cfg.commerce?.whatsapp_number).toBe("07701234567");
        expect(cfg.commerce?.shipping?.default_rate?.fee_iqd).toBe(3000);
    });

    it("stamps the business name onto the hero brand-label field", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id, // kinetic_ink → includes a hero_image
            businessName: "Audit Test Store",
        });
        const home = cfg.pages.find((p) => p.page_id === "home");
        const hero = home?.sections.find((s) => s.type === "hero_image");
        expect(hero).toBeDefined();
        const eyebrow = (hero!.base as Record<string, unknown>)
            .eyebrow_i18n as Record<string, string>;
        expect(eyebrow.ar).toBe("Audit Test Store");
    });

    it("every vertical recommends a real template", () => {
        const ids = new Set(STARTER_TEMPLATES.map((t) => t.id));
        for (const v of STARTER_VERTICALS) {
            expect(ids.has(v.recommendedTemplateId)).toBe(true);
        }
    });

    it("recommendedTemplateForVertical falls back for an unknown vertical", () => {
        expect(recommendedTemplateForVertical("nope")).toBe(STARTER_TEMPLATES[0].id);
        expect(recommendedTemplateForVertical("food")).toBe("sunbleach");
    });

    it("leaves the home page empty for an unknown template id", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: "does-not-exist",
            businessName: "X",
        });
        const home = cfg.pages.find((p) => p.page_id === "home");
        expect(home?.sections).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────
// Industry copy packs (UX-11)
// ─────────────────────────────────────────────────────────────────────

describe("industry seed copy", () => {
    function seededStory(industryId?: string) {
        // cobalt_broadsheet is a direction that carries a brand_story section.
        const cfg = buildStarterStoreConfigV2({
            templateId: "cobalt_broadsheet",
            industryId,
            businessName: "متجر فاطمة للتجميل",
        });
        const home = cfg.pages.find((p) => p.page_id === "home");
        const story = home?.sections.find((s) => s.type === "brand_story");
        return (story?.base ?? {}) as Record<
            string,
            Record<string, string> | undefined
        >;
    }

    it("beauty pack replaces the fashion default story", () => {
        const base = seededStory("beauty");
        const paragraphs = base.paragraphs_i18n?.ar ?? "";
        // No leaked fashion copy or old brand backstory.
        expect(paragraphs).not.toContain("سنرتديها");
        expect(paragraphs).not.toContain("شنايدرز");
        expect(paragraphs).toContain("أصلي");
    });

    it("unknown industries get the neutral de-branded default pack", () => {
        const base = seededStory("carpets_or_something");
        const paragraphs = base.paragraphs_i18n?.ar ?? "";
        expect(paragraphs).not.toContain("شنايدرز");
        expect(paragraphs).not.toContain("سنرتديها");
    });

    it("seeds no invented customer reviews — the section stays empty until the merchant has real ones", () => {
        for (const industryId of ["beauty", "fashion", "electronics", "food", "coffee", undefined]) {
            const cfg = buildStarterStoreConfigV2({
                templateId: "kinetic_ink",
                industryId,
                businessName: "X",
            });
            const home = cfg.pages.find((p) => p.page_id === "home");
            const t = home?.sections.find((s) => s.type === "testimonials_carousel");
            if (!t) continue; // template variant without reviews
            const items = (t.base as { items: unknown[] }).items;
            expect(items, `pack ${industryId} shipped fabricated reviews`).toEqual([]);
        }
    });

    it("two sections of the same type never share pack objects by reference", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: "kinetic_ink",
            industryId: "beauty",
            businessName: "X",
        });
        const stories = cfg.pages
            .flatMap((p) => p.sections)
            .filter((s) => s.type === "testimonials_carousel");
        if (stories.length >= 2) {
            const a = (stories[0].base as { items: unknown[] }).items;
            const b = (stories[1].base as { items: unknown[] }).items;
            expect(a).not.toBe(b);
        }
    });
});

    it("resolves DB display names to packs (uuid ids arrive as names)", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: "cobalt_broadsheet",
            industryId: "Beauty & Cosmetics",
            businessName: "X",
        });
        const home = cfg.pages.find((p) => p.page_id === "home");
        const story = home?.sections.find((s) => s.type === "brand_story");
        const paragraphs = (
            (story?.base as Record<string, Record<string, string>>).paragraphs_i18n ?? {}
        ).ar ?? "";
        expect(paragraphs).toContain("أصلي");
    });

describe("buildStarterStoreConfigV2 — content packs (W6.1)", () => {
    it("stamps the direction × pack the store was seeded from", () => {
        const cfg = buildStarterStoreConfigV2({ templateId: "kinetic_ink", industryId: "Coffee roastery", businessName: "بن" });
        expect(cfg.template).toMatchObject({ direction_id: "kinetic_ink", pack_id: "coffee", version: 1 });
        expect(typeof cfg.template?.applied_at).toBe("string");
    });

    it("an explicit packId wins over the industry name", () => {
        const cfg = buildStarterStoreConfigV2({ templateId: "sunbleach", packId: "services", industryId: "Beauty & Cosmetics", businessName: "x" });
        expect(cfg.template?.pack_id).toBe("services");
    });

    it("starterTaxonomy returns the pack's categories and attributes", () => {
        const t = starterTaxonomy("perfume");
        expect(t.categories.map((c) => c.slug)).toContain("work");
        expect(t.attribute_defs.map((a) => a.key)).toContain("scent_family");
        expect(starterTaxonomy(undefined).pack.id).toBe("general");
    });
});
