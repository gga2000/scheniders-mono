/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import type {
    BrandKit,
    PageConfig,
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";
import { computePublishDiff } from "./publish-diff";

const emptyBrandKit: BrandKit = {
    identity: {},
    colors: {
        primary: "#000",
        secondary: "#111",
        accent: "#222",
        surface: "#fff",
        surface_alt: "#eee",
        ink: "#000",
        success: "#0f0",
        danger: "#f00",
    },
    typography: { display: "Inter", body: "Inter", scale: "comfortable" },
    shape: {
        radius: "soft",
        border_thickness: "thin",
        shadow_style: "soft",
        rotation_intensity: "subtle",
    },
    motion: { enabled: true, speed: "normal" },
    voice: { formality: "casual" },
};

function makeSection(
    id: string,
    type: string,
    base: Record<string, unknown> = {},
    overrides: Partial<SectionInstance> = {},
): SectionInstance {
    return {
        id,
        type,
        enabled: true,
        base,
        ...overrides,
    };
}

function makePage(page_id: PageConfig["page_id"], sections: SectionInstance[]): PageConfig {
    return { page_id, sections };
}

function makeConfig(overrides: Partial<StoreConfigV2> = {}): StoreConfigV2 {
    return {
        schema_version: 2,
        brand_kit: emptyBrandKit,
        pages: [],
        globals: {},
        experiments: [],
        segments: [],
        schedules: [],
        default_locale: "en",
        enabled_locales: ["en"],
        ...overrides,
    };
}

describe("computePublishDiff", () => {
    it("treats a null prev config as the first publish (everything added)", () => {
        const next = makeConfig({
            pages: [
                makePage("home", [
                    makeSection("s1", "hero_image", { title_i18n: { en: "Hi" } }),
                ]),
            ],
        });
        const diff = computePublishDiff(null, next);
        expect(diff.isFirstPublish).toBe(true);
        expect(diff.brandKitChanged).toBe(true);
        expect(diff.totalChanges).toBe(1);
        expect(diff.pages[0]?.changes[0]?.kind).toBe("added");
    });

    it("returns no changes for identical configs", () => {
        const cfg = makeConfig({
            pages: [
                makePage("home", [makeSection("s1", "hero_image", { x: 1 })]),
            ],
        });
        const cfg2: StoreConfigV2 = JSON.parse(JSON.stringify(cfg));
        const diff = computePublishDiff(cfg, cfg2);
        expect(diff.isFirstPublish).toBe(false);
        expect(diff.totalChanges).toBe(0);
        expect(diff.brandKitChanged).toBe(false);
        expect(diff.globalsChanged).toEqual([]);
        expect(diff.pages).toEqual([]);
    });

    it("flags an added section on an existing page", () => {
        const prev = makeConfig({
            pages: [makePage("home", [makeSection("s1", "hero_image", {})])],
        });
        const next = makeConfig({
            pages: [
                makePage("home", [
                    makeSection("s1", "hero_image", {}),
                    makeSection("s2", "newsletter_inline", {}),
                ]),
            ],
        });
        const diff = computePublishDiff(prev, next);
        expect(diff.totalChanges).toBe(1);
        expect(diff.pages[0].changes[0]).toMatchObject({
            kind: "added",
            section_id: "s2",
            section_type: "newsletter_inline",
        });
    });

    it("flags a removed section", () => {
        const prev = makeConfig({
            pages: [
                makePage("home", [
                    makeSection("s1", "hero_image", {}),
                    makeSection("s2", "trust_strip", {}),
                ]),
            ],
        });
        const next = makeConfig({
            pages: [makePage("home", [makeSection("s1", "hero_image", {})])],
        });
        const diff = computePublishDiff(prev, next);
        expect(diff.totalChanges).toBe(1);
        expect(diff.pages[0].changes[0]).toMatchObject({
            kind: "removed",
            section_id: "s2",
        });
    });

    it("flags a modified section with per-locale i18n deltas + a scalar delta", () => {
        const prev = makeConfig({
            pages: [
                makePage("home", [
                    makeSection("s1", "hero_image", {
                        title_i18n: { en: "Welcome", ar: "أهلا" },
                        image_url: "https://a.example/x.png",
                    }),
                ]),
            ],
        });
        const next = makeConfig({
            pages: [
                makePage("home", [
                    makeSection("s1", "hero_image", {
                        title_i18n: { en: "Grand Opening 20% OFF", ar: "أهلا" },
                        image_url: "https://b.example/x.png",
                    }),
                ]),
            ],
        });
        const diff = computePublishDiff(prev, next);
        expect(diff.totalChanges).toBe(1);
        const change = diff.pages[0].changes[0];
        expect(change.kind).toBe("modified");
        expect(change.deltas).toBeDefined();
        const titleDelta = change.deltas!.find((d) => d.field === "title_i18n");
        expect(titleDelta).toMatchObject({
            field: "title_i18n",
            kind: "i18n",
            locale: "en",
            before: "Welcome",
            after: "Grand Opening 20% OFF",
        });
        const imgDelta = change.deltas!.find((d) => d.field === "image_url");
        expect(imgDelta).toMatchObject({
            kind: "scalar",
            before: "https://a.example/x.png",
            after: "https://b.example/x.png",
        });
    });

    it("treats a reorder (same ids, different order) as no field changes", () => {
        const a = makeSection("s1", "hero_image", { x: 1 });
        const b = makeSection("s2", "trust_strip", { y: 2 });
        const prev = makeConfig({ pages: [makePage("home", [a, b])] });
        const next = makeConfig({ pages: [makePage("home", [b, a])] });
        const diff = computePublishDiff(prev, next);
        // Order only ⇒ section bases are identical ⇒ no per-field deltas.
        expect(diff.totalChanges).toBe(0);
    });

    it("flags a brand kit change", () => {
        const prev = makeConfig({});
        const next = makeConfig({
            brand_kit: {
                ...emptyBrandKit,
                colors: { ...emptyBrandKit.colors, primary: "#abcdef" },
            },
        });
        const diff = computePublishDiff(prev, next);
        expect(diff.brandKitChanged).toBe(true);
        expect(diff.totalChanges).toBe(0);
    });

    it("flags globals changes (promo bar slot only)", () => {
        const prev = makeConfig({});
        const next = makeConfig({
            globals: {
                promo_bar: makeSection("pb", "promo_banner", { text_i18n: { en: "Sale" } }),
            },
        });
        const diff = computePublishDiff(prev, next);
        expect(diff.globalsChanged).toEqual(["promo_bar"]);
        expect(diff.brandKitChanged).toBe(false);
    });

    it("treats a fully removed page as a page-level entry with removed sections", () => {
        const prev = makeConfig({
            pages: [
                makePage("home", [makeSection("h", "hero_image", {})]),
                makePage("about", [makeSection("a", "about_block", {})]),
            ],
        });
        const next = makeConfig({
            pages: [makePage("home", [makeSection("h", "hero_image", {})])],
        });
        const diff = computePublishDiff(prev, next);
        expect(diff.pages.find((p) => p.page_id === "about")).toBeDefined();
        const aboutPage = diff.pages.find((p) => p.page_id === "about")!;
        expect(aboutPage.changes[0]).toMatchObject({ kind: "removed", section_id: "a" });
    });
});
