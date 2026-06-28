import { describe, it, expect } from "vitest";
import { runHealthChecks, blockingChecks } from "./health-rules";
import { emptyStoreConfigV2 } from "./types/store-config-v2-resolver";
import type {
    PageId,
    SectionInstance,
    StoreConfigV2,
} from "./types/store-config-v2";

/* ─────────────────────────────────────────────────────────────────── */
/* Fixtures                                                            */
/* ─────────────────────────────────────────────────────────────────── */

function s(type: string, base: Record<string, unknown> = {}): SectionInstance {
    return {
        id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        enabled: true,
        base,
    };
}

function setPage(cfg: StoreConfigV2, id: PageId, sections: SectionInstance[]): void {
    const p = cfg.pages.find((p) => p.page_id === id);
    if (p) p.sections = sections;
}

function freshEmpty(): StoreConfigV2 {
    // Deep-clone so we don't mutate the shared EMPTY_BRAND_KIT object.
    return JSON.parse(JSON.stringify(emptyStoreConfigV2())) as StoreConfigV2;
}

function fullyPopulatedConfig(): StoreConfigV2 {
    const cfg = freshEmpty();
    cfg.brand_kit.identity = {
        name: "Test Store",
        tagline: { en: "Beautiful things, fairly priced." },
        logo_url: "https://cdn/logo.png",
        favicon_url: "https://cdn/favicon.ico",
        og_image_url: "https://cdn/og.jpg",
    };
    // Policies
    setPage(cfg, "policy_privacy", [s("about_block", { body: "Privacy text" })]);
    setPage(cfg, "policy_shipping", [s("about_block", { body: "Shipping text" })]);
    setPage(cfg, "policy_returns", [s("about_block", { body: "Returns text" })]);
    setPage(cfg, "policy_terms", [s("about_block", { body: "Terms text" })]);
    // Home
    setPage(cfg, "home", [
        s("hero_image", { title: "Welcome", image_url: "https://cdn/hero.jpg" }),
        s("trust_strip", { pills: [{ label_i18n: { en: "Free shipping" } }] }),
        s("product_grid", { title: "Best sellers" }),
        s("testimonials_carousel", { items: [{ quote: "Great" }] }),
        s("newsletter_inline", { headline: "Join us" }),
    ]);
    // Product page
    setPage(cfg, "product", [s("delivery_promise", { headline: "Fast delivery" })]);
    // Cart
    setPage(cfg, "cart", [s("promo_banner", { headline: "Free gift over 50K" })]);
    // Contact
    setPage(cfg, "contact", [s("about_block", { body: "Reach us" })]);
    // Meta
    const home = cfg.pages.find((p) => p.page_id === "home")!;
    home.meta = {
        title: { en: "Test Store — best in Iraq" },
        description: { en: "Shop the best curated picks for Iraq." },
    };
    // Globals
    cfg.globals.analytics_pixels = s("analytics_pixels", {
        meta_pixel_id: "1234567890",
    });
    cfg.globals.footer = s("footer", {
        contact_phone: "+9647701234567",
        whatsapp_number: "+9647701234567",
        instagram_url: "https://instagram.com/x",
    });
    return cfg;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                               */
/* ─────────────────────────────────────────────────────────────────── */

describe("runHealthChecks — empty config", () => {
    const empty = freshEmpty();
    const report = runHealthChecks(empty);

    it("evaluates 36 checks", () => {
        expect(report.checks).toHaveLength(36);
    });

    it("scores below 30", () => {
        expect(report.score).toBeLessThan(30);
    });

    it("has multiple blocks_publish entries", () => {
        const blocked = blockingChecks(report);
        expect(blocked.length).toBeGreaterThan(1);
    });

    it("orders failing checks first", () => {
        const idx = report.checks.findIndex((c) => c.status === "pass");
        const failCount = report.checks.filter((c) => c.status === "fail").length;
        if (failCount > 0) {
            expect(idx === -1 || idx >= failCount).toBe(true);
        }
    });
});

describe("runHealthChecks — fully populated config", () => {
    const cfg = fullyPopulatedConfig();
    const report = runHealthChecks(cfg);

    it("scores above 80", () => {
        expect(report.score).toBeGreaterThan(80);
    });

    it("ad_compliance category reaches 100 once policies + pixels + og are set", () => {
        expect(report.category_scores.ad_compliance).toBe(100);
    });

    it("has no blocks_publish entries", () => {
        expect(blockingChecks(report)).toHaveLength(0);
    });
});

describe("runHealthChecks — adding policies pushes ad_compliance to 100", () => {
    it("starts low, ends at 100", () => {
        const cfg = freshEmpty();
        // Set the non-policy ad-compliance bits so the only missing pieces
        // are policy pages.
        cfg.brand_kit.identity.og_image_url = "https://cdn/og.jpg";
        cfg.globals.analytics_pixels = s("analytics_pixels", { meta_pixel_id: "1" });
        cfg.globals.footer = s("footer", { contact_phone: "+9647", whatsapp_number: "+9647" });

        const before = runHealthChecks(cfg);
        expect(before.category_scores.ad_compliance).toBeLessThan(100);

        setPage(cfg, "policy_privacy", [s("about_block", { body: "x" })]);
        setPage(cfg, "policy_shipping", [s("about_block", { body: "x" })]);
        setPage(cfg, "policy_returns", [s("about_block", { body: "x" })]);
        setPage(cfg, "policy_terms", [s("about_block", { body: "x" })]);

        const after = runHealthChecks(cfg);
        expect(after.category_scores.ad_compliance).toBe(100);
    });
});

describe("runHealthChecks — home_has_content (EC11)", () => {
    it("blocks publish when the home page has zero sections", () => {
        const cfg = fullyPopulatedConfig();
        setPage(cfg, "home", []);
        const r = runHealthChecks(cfg);
        const home = r.checks.find((c) => c.id === "home_has_content");
        expect(home?.status).toBe("fail");
        expect(home?.blocks_publish).toBe(true);
    });

    it("blocks publish when every home section is disabled (all-hidden)", () => {
        const cfg = fullyPopulatedConfig();
        const homePage = cfg.pages.find((p) => p.page_id === "home")!;
        homePage.sections = homePage.sections.map((s) => ({ ...s, enabled: false }));
        const r = runHealthChecks(cfg);
        const home = r.checks.find((c) => c.id === "home_has_content");
        expect(home?.status).toBe("fail");
        expect(home?.blocks_publish).toBe(true);
    });

    it("passes when the home page has at least one visible section", () => {
        const cfg = fullyPopulatedConfig();
        const r = runHealthChecks(cfg);
        const home = r.checks.find((c) => c.id === "home_has_content");
        expect(home?.status).toBe("pass");
    });
});

describe("runHealthChecks — lorem ipsum detector", () => {
    it("trips when 'lorem ipsum dolor' is found in section text", () => {
        const cfg = fullyPopulatedConfig();
        setPage(cfg, "home", [
            s("hero_image", {
                title: "Lorem ipsum dolor sit amet",
                image_url: "https://cdn/hero.jpg",
            }),
            ...(cfg.pages.find((p) => p.page_id === "home")?.sections ?? []),
        ]);
        const r = runHealthChecks(cfg);
        const lorem = r.checks.find((c) => c.id === "no_lorem_ipsum");
        expect(lorem?.status).toBe("fail");
    });

    it("passes when no placeholder text exists", () => {
        const cfg = fullyPopulatedConfig();
        const r = runHealthChecks(cfg);
        const lorem = r.checks.find((c) => c.id === "no_lorem_ipsum");
        expect(lorem?.status).toBe("pass");
    });
});

describe("runHealthChecks — hero image content rule", () => {
    it("warns when a hero has no image", () => {
        const cfg = fullyPopulatedConfig();
        setPage(cfg, "home", [s("hero_image", { title: "x" })]);
        const r = runHealthChecks(cfg);
        const c = r.checks.find((c) => c.id === "at_least_one_image_per_hero");
        expect(c?.status).toBe("warn");
    });
});

describe("runHealthChecks — translation completeness rule", () => {
    it("passes when only the default locale is enabled (no secondary to translate)", () => {
        const cfg = fullyPopulatedConfig(); // en-only, enabled=[en]
        const c = runHealthChecks(cfg).checks.find(
            (c) => c.id === "translations_complete",
        );
        expect(c?.status).toBe("pass");
    });

    it("warns (without blocking) when an enabled secondary locale is mostly untranslated", () => {
        const cfg = fullyPopulatedConfig();
        cfg.default_locale = "ar";
        cfg.enabled_locales = ["ar", "en"];
        // Home has Arabic i18n content but English is missing.
        setPage(cfg, "home", [
            s("hero_image", {
                title_i18n: { ar: "مرحبا بكم" },
                subtitle_i18n: { ar: "تسوّق الآن" },
                image_url: "https://cdn/hero.jpg",
            }),
        ]);
        const c = runHealthChecks(cfg).checks.find(
            (c) => c.id === "translations_complete",
        );
        expect(c?.status).toBe("warn");
        expect(c?.blocks_publish).not.toBe(true);
    });

    it("passes when every enabled locale is fully translated", () => {
        const cfg = fullyPopulatedConfig();
        cfg.default_locale = "ar";
        cfg.enabled_locales = ["ar", "en"];
        setPage(cfg, "home", [
            s("hero_image", {
                title_i18n: { ar: "مرحبا", en: "Welcome" },
                image_url: "https://cdn/hero.jpg",
            }),
        ]);
        const c = runHealthChecks(cfg).checks.find(
            (c) => c.id === "translations_complete",
        );
        expect(c?.status).toBe("pass");
    });
});

describe("runHealthChecks — score distribution example", () => {
    it("prints empty and full scores for the final report", () => {
        const empty = runHealthChecks(freshEmpty());
        const full = runHealthChecks(fullyPopulatedConfig());
        // Surface in test output for the agent to copy into the final
        // summary. The asserts below ensure the numbers are coherent.
        // eslint-disable-next-line no-console
        console.log(
            JSON.stringify(
                {
                    empty: { score: empty.score, categories: empty.category_scores },
                    full: { score: full.score, categories: full.category_scores },
                },
                null,
                2,
            ),
        );
        expect(empty.score).toBeLessThan(full.score);
    });
});

/* ─────────────────────────────────────────────────────────────────── */
/* New checks — H3 (noindex), H5 (alt text), H6 (dead links)            */
/* ─────────────────────────────────────────────────────────────────── */

function checkStatus(cfg: StoreConfigV2, id: string): string | undefined {
    return runHealthChecks(cfg).checks.find((c) => c.id === id)?.status;
}

describe("important_pages_indexable (H3)", () => {
    it("passes when nothing is noindexed", () => {
        expect(checkStatus(freshEmpty(), "important_pages_indexable")).toBe("pass");
    });
    it("fails when the home page is noindex", () => {
        const cfg = freshEmpty();
        const home = cfg.pages.find((p) => p.page_id === "home");
        if (home) home.meta = { noindex: true };
        expect(checkStatus(cfg, "important_pages_indexable")).toBe("fail");
    });
    it("warns when a policy page is noindex", () => {
        const cfg = freshEmpty();
        const pol = cfg.pages.find((p) => p.page_id === "policy_returns");
        if (pol) pol.meta = { noindex: true };
        expect(checkStatus(cfg, "important_pages_indexable")).toBe("warn");
    });
});

describe("images_have_alt_text (H5)", () => {
    it("warns when an image has an empty alt sibling", () => {
        const cfg = freshEmpty();
        setPage(cfg, "home", [
            s("hero_image", { image_url: "https://cdn/h.jpg", alt: "" }),
        ]);
        expect(checkStatus(cfg, "images_have_alt_text")).toBe("warn");
    });
    it("passes when alt is filled", () => {
        const cfg = freshEmpty();
        setPage(cfg, "home", [
            s("hero_image", { image_url: "https://cdn/h.jpg", alt: "A hero" }),
        ]);
        expect(checkStatus(cfg, "images_have_alt_text")).toBe("pass");
    });
    it("skips decorative images with no alt field at all", () => {
        const cfg = freshEmpty();
        setPage(cfg, "home", [
            s("logo_strip", { image_url: "https://cdn/logo.jpg" }),
        ]);
        expect(checkStatus(cfg, "images_have_alt_text")).toBe("pass");
    });
});

describe("no_dead_cta_links (H6)", () => {
    it("warns on a '#' CTA href", () => {
        const cfg = freshEmpty();
        setPage(cfg, "home", [s("cta_banner", { cta_href: "#" })]);
        expect(checkStatus(cfg, "no_dead_cta_links")).toBe("warn");
    });
    it("warns on a localhost link", () => {
        const cfg = freshEmpty();
        setPage(cfg, "home", [s("hero_image", { href: "http://localhost:3001/x" })]);
        expect(checkStatus(cfg, "no_dead_cta_links")).toBe("warn");
    });
    it("passes on a real href and ignores an empty optional url", () => {
        const cfg = freshEmpty();
        setPage(cfg, "home", [s("cta_banner", { cta_href: "/products", url: "" })]);
        expect(checkStatus(cfg, "no_dead_cta_links")).toBe("pass");
    });
    it("does not flag a localhost image_url (not a CTA field)", () => {
        const cfg = freshEmpty();
        setPage(cfg, "home", [
            s("hero_image", { image_url: "http://localhost/h.jpg" }),
        ]);
        expect(checkStatus(cfg, "no_dead_cta_links")).toBe("pass");
    });
});

describe("default_locale_enabled", () => {
    it("passes when the default locale is enabled", () => {
        const cfg = freshEmpty();
        cfg.default_locale = "ar";
        cfg.enabled_locales = ["ar", "en"];
        expect(checkStatus(cfg, "default_locale_enabled")).toBe("pass");
    });

    it("passes when no locales are explicitly enabled (all supported)", () => {
        const cfg = freshEmpty();
        cfg.default_locale = "ku";
        cfg.enabled_locales = [];
        expect(checkStatus(cfg, "default_locale_enabled")).toBe("pass");
    });

    it("warns when the default locale is not in the enabled list", () => {
        const cfg = freshEmpty();
        cfg.default_locale = "ku";
        cfg.enabled_locales = ["ar", "en"];
        expect(checkStatus(cfg, "default_locale_enabled")).toBe("warn");
    });
});
