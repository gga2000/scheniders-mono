import { describe, expect, it } from "vitest";
import {
    buildStarterStoreConfigV2,
    recommendedTemplateForVertical,
    STARTER_TEMPLATES,
    STARTER_VERTICALS,
} from "./starter-store";

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
        expect(home?.sections.length).toBe(FIRST.sections.length);
        expect(home!.sections.length).toBeGreaterThan(0);
    });

    it("rehashes template section ids (no placeholders leak through)", () => {
        const cfg = buildStarterStoreConfigV2({
            templateId: FIRST.id,
            businessName: "X",
        });
        const home = cfg.pages.find((p) => p.page_id === "home");
        for (const s of home!.sections) {
            expect(s.id).not.toMatch(/^__template-/);
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
        for (const id of ids) expect(id).not.toMatch(/^__template-/);
    });

    it("every vertical recommends a real template", () => {
        const ids = new Set(STARTER_TEMPLATES.map((t) => t.id));
        for (const v of STARTER_VERTICALS) {
            expect(ids.has(v.recommendedTemplateId)).toBe(true);
        }
    });

    it("recommendedTemplateForVertical falls back for an unknown vertical", () => {
        expect(recommendedTemplateForVertical("nope")).toBe(STARTER_TEMPLATES[0].id);
        expect(recommendedTemplateForVertical("food")).toBe("iraqi_market_landing");
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
