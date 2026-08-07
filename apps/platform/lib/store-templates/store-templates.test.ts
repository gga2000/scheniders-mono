import { describe, expect, it } from "vitest";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type { PageId } from "@scheniders/shared";
import { getManifestEntry } from "@/lib/sections-manifest";
import {
    LEGACY_TEMPLATE_ALIAS,
    STORE_TEMPLATES,
    applyStoreTemplate,
    getStoreTemplate,
    storeTemplateSections,
} from "./index";

const RADIUS = ["none", "soft", "round", "pill"];
const BORDER = ["none", "thin", "thick", "chunky"];
const SHADOW = ["flat", "soft", "hard-offset", "elevated"];
const ROTATION = ["none", "subtle", "playful", "wild"];
const SPEED = ["slow", "normal", "snappy"];
const FORMALITY = ["formal", "casual", "playful", "luxe"];
const HEX = /^#[0-9a-f]{6}$/;

describe("store templates", () => {
    it("ships exactly six directions with unique ids", () => {
        expect(STORE_TEMPLATES).toHaveLength(6);
        const ids = STORE_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("every referenced section type exists in the manifest", () => {
        for (const tpl of STORE_TEMPLATES) {
            const types = [
                tpl.globals.header.type,
                tpl.globals.footer.type,
                ...Object.values(tpl.pages).flatMap((s) => s.map((x) => x.type)),
            ];
            for (const type of types) {
                expect(getManifestEntry(type), `${tpl.id} → ${type}`).toBeDefined();
            }
        }
    });

    it("every section is valid on the page it is placed on", () => {
        for (const tpl of STORE_TEMPLATES) {
            for (const [pageId, sections] of Object.entries(tpl.pages)) {
                for (const s of sections) {
                    const entry = getManifestEntry(s.type);
                    expect(
                        entry?.valid_on.includes(pageId as PageId),
                        `${tpl.id}: ${s.type} is not valid on ${pageId}`,
                    ).toBe(true);
                }
            }
        }
    });

    it("globals carry the header and footer sections", () => {
        for (const tpl of STORE_TEMPLATES) {
            expect(tpl.globals.header.type).toBe("site_header");
            expect(tpl.globals.footer.type).toBe("site_footer");
        }
    });

    it("every brand kit uses legal enum values and hex colours", () => {
        for (const tpl of STORE_TEMPLATES) {
            const bk = tpl.brand_kit;
            for (const [key, value] of Object.entries(bk.colors)) {
                expect(value, `${tpl.id}.colors.${key}`).toMatch(HEX);
            }
            expect(RADIUS).toContain(bk.shape.radius);
            expect(BORDER).toContain(bk.shape.border_thickness);
            expect(SHADOW).toContain(bk.shape.shadow_style);
            expect(ROTATION).toContain(bk.shape.rotation_intensity);
            expect(SPEED).toContain(bk.motion.speed);
            expect(FORMALITY).toContain(bk.voice.formality);
            expect(bk.typography.display_ar, `${tpl.id} arabic display`).toBeTruthy();
            expect(bk.typography.body_ar, `${tpl.id} arabic body`).toBeTruthy();
        }
    });

    it("the six directions are visually distinct on primary and surface", () => {
        const primaries = STORE_TEMPLATES.map((t) => t.brand_kit.colors.primary);
        const surfaces = STORE_TEMPLATES.map((t) => t.brand_kit.colors.surface);
        expect(new Set(primaries).size).toBe(6);
        expect(new Set(surfaces).size).toBe(6);
    });

    it("every direction covers home, product, and the four policy pages", () => {
        const required: PageId[] = [
            "home",
            "category",
            "product",
            "cart",
            "checkout",
            "about",
            "faq",
            "policy_shipping",
            "policy_returns",
            "policy_privacy",
            "policy_terms",
        ];
        for (const tpl of STORE_TEMPLATES) {
            for (const pageId of required) {
                expect(
                    (tpl.pages[pageId] ?? []).length,
                    `${tpl.id} is missing ${pageId}`,
                ).toBeGreaterThan(0);
            }
        }
    });

    it("every home page can be ordered from: WhatsApp CTA plus a product grid", () => {
        for (const tpl of STORE_TEMPLATES) {
            const home = tpl.pages.home ?? [];
            const hero = home.find((s) => s.type.startsWith("hero_"));
            expect(hero, `${tpl.id} has no hero`).toBeDefined();
            expect(
                (hero!.base as Record<string, unknown>).secondary_cta_kind,
                `${tpl.id} hero is not wired to WhatsApp`,
            ).toBe("whatsapp");
            expect(home.some((s) => s.type === "product_grid")).toBe(true);
        }
    });
});

describe("getStoreTemplate", () => {
    it("resolves by id", () => {
        expect(getStoreTemplate("kinetic_ink")?.id).toBe("kinetic_ink");
    });

    it("resolves legacy page-template ids through the alias map", () => {
        for (const [legacy, target] of Object.entries(LEGACY_TEMPLATE_ALIAS)) {
            expect(getStoreTemplate(legacy)?.id, legacy).toBe(target);
        }
    });

    it("returns undefined for an unknown id", () => {
        expect(getStoreTemplate("nope")).toBeUndefined();
    });
});

describe("applyStoreTemplate", () => {
    it("writes the brand kit but preserves identity", () => {
        const cfg = emptyStoreConfigV2();
        cfg.brand_kit.identity.name = "متجر نور";
        applyStoreTemplate(cfg, STORE_TEMPLATES[0]);
        expect(cfg.brand_kit.colors.primary).toBe(
            STORE_TEMPLATES[0].brand_kit.colors.primary,
        );
        expect(cfg.brand_kit.identity.name).toBe("متجر نور");
    });

    it("never mutates the canonical template object", () => {
        const tpl = STORE_TEMPLATES[1];
        const before = JSON.stringify(tpl);
        const cfg = applyStoreTemplate(emptyStoreConfigV2(), tpl);
        const home = cfg.pages.find((p) => p.page_id === "home");
        (home!.sections[0].base as Record<string, unknown>).mutated = true;
        expect(JSON.stringify(tpl)).toBe(before);
    });

    it("mints unique, non-placeholder ids across every page and global", () => {
        const cfg = applyStoreTemplate(emptyStoreConfigV2(), STORE_TEMPLATES[2]);
        const ids = [
            cfg.globals.header!.id,
            cfg.globals.footer!.id,
            ...cfg.pages.flatMap((p) => p.sections.map((s) => s.id)),
        ];
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).not.toMatch(/^__/);
    });

    it("re-applying the same template produces different ids", () => {
        const a = applyStoreTemplate(emptyStoreConfigV2(), STORE_TEMPLATES[3]);
        const b = applyStoreTemplate(emptyStoreConfigV2(), STORE_TEMPLATES[3]);
        const aHome = a.pages.find((p) => p.page_id === "home")!.sections[0].id;
        const bHome = b.pages.find((p) => p.page_id === "home")!.sections[0].id;
        expect(aHome).not.toBe(bHome);
    });
});

describe("storeTemplateSections", () => {
    it("returns fresh sections for a page and an empty list for uncovered pages", () => {
        const tpl = STORE_TEMPLATES[4];
        expect(storeTemplateSections(tpl, "home").length).toBeGreaterThan(0);
        expect(storeTemplateSections(tpl, "not_found")).toEqual([]);
    });
});
