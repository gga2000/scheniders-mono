import { describe, it, expect } from "vitest";
import { runHealthChecks, blockingChecks, healthBand } from "./health-rules";
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

    it("evaluates 37 checks", () => {
        expect(report.checks).toHaveLength(37);
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

describe("whatsapp_number_set — config-level number is the source of truth", () => {
    it("passes on commerce.whatsapp_number alone (no section number)", () => {
        const cfg = freshEmpty();
        cfg.commerce = { whatsapp_number: "07701234567" };
        const report = runHealthChecks(cfg);
        const check = report.checks.find((c) => c.id === "whatsapp_number_set");
        expect(check?.status).toBe("pass");
    });

    it("still passes via section-level fallback for legacy stores", () => {
        const cfg = freshEmpty();
        cfg.globals.footer = s("footer", { whatsapp_number: "+9647701234567" });
        const report = runHealthChecks(cfg);
        const check = report.checks.find((c) => c.id === "whatsapp_number_set");
        expect(check?.status).toBe("pass");
    });

    it("warns when neither config nor sections carry a number", () => {
        const cfg = freshEmpty();
        const report = runHealthChecks(cfg);
        const check = report.checks.find((c) => c.id === "whatsapp_number_set");
        expect(check?.status).toBe("warn");
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

describe("runHealthChecks — checks match what the storefront shows", () => {
    it("product and category templates never count as missing a Google title", () => {
        const cfg = fullyPopulatedConfig();
        for (const p of cfg.pages) {
            p.meta = { ...(p.meta ?? {}), title: { en: "T" } };
        }
        for (const id of ["product", "category"] as PageId[]) {
            const page = cfg.pages.find((p) => p.page_id === id);
            if (page) page.meta = {};
        }
        const c = runHealthChecks(cfg).checks.find((c) => c.id === "every_page_has_meta_title");
        expect(c?.status).toBe("pass");
    });

    it("names the pages missing a title and opens the SEO tab", () => {
        const cfg = fullyPopulatedConfig();
        const about = cfg.pages.find((p) => p.page_id === "about");
        if (about) about.meta = {};
        const c = runHealthChecks(cfg).checks.find((c) => c.id === "every_page_has_meta_title");
        expect(c?.message).toContain("about");
        expect(c?.fix_action?.go_to).toMatchObject({ kind: "page", tab: "seo" });
    });

    it("an Arabic-only store (no enabled locales) is not asked for translations", () => {
        const cfg = fullyPopulatedConfig();
        cfg.default_locale = "ar";
        cfg.enabled_locales = [];
        setPage(cfg, "home", [s("hero_image", { title_i18n: { ar: "مرحبا" }, image_url: "x" })]);
        const c = runHealthChecks(cfg).checks.find((c) => c.id === "translations_complete");
        expect(c?.status).toBe("pass");
    });

    it("counts Arabic font pairings in the font budget", () => {
        const cfg = fullyPopulatedConfig();
        cfg.brand_kit.typography = {
            ...cfg.brand_kit.typography,
            display: "Inter",
            body: "Inter",
            display_ar: "Readex Pro",
            body_ar: "Cairo",
        };
        const c = runHealthChecks(cfg).checks.find((c) => c.id === "font_count_reasonable");
        expect(c?.status).toBe("warn");
    });

    it("pixel fix opens the pixels screen", () => {
        const cfg = freshEmpty();
        const c = runHealthChecks(cfg).checks.find((c) => c.id === "pixel_or_gtm_configured");
        expect(c?.fix_action?.go_to).toEqual({ kind: "settings", key: "pixels" });
    });

    it("a WhatsApp number the store shows from Settings passes", () => {
        const c = runHealthChecks(freshEmpty(), { whatsapp: "07779703832" }).checks.find(
            (c) => c.id === "whatsapp_number_set",
        );
        expect(c?.status).toBe("pass");
    });
});

describe("runHealthChecks — og_image_set", () => {
    const status = (cfg: StoreConfigV2) =>
        runHealthChecks(cfg).checks.find((c) => c.id === "og_image_set")?.status;

    it("fails with no share image anywhere", () => {
        expect(status(freshEmpty())).toBe("fail");
    });

    it("passes on the home page's own SEO image (the storefront falls back to it)", () => {
        const cfg = freshEmpty();
        const home = cfg.pages.find((p) => p.page_id === "home");
        if (!home) throw new Error("fixture has no home page");
        home.meta = { ...home.meta, og_image_url: "https://cdn/home.jpg" };
        expect(status(cfg)).toBe("pass");
    });

    it("treats a blank brand image as missing", () => {
        const cfg = freshEmpty();
        cfg.brand_kit.identity.og_image_url = "  ";
        expect(status(cfg)).toBe("fail");
    });
});

describe("runHealthChecks — conversion checks see every section that does the job", () => {
    const status = (cfg: StoreConfigV2, id: string) =>
        runHealthChecks(cfg).checks.find((c) => c.id === id)?.status;

    function storeLikeScheniders(): StoreConfigV2 {
        const cfg = fullyPopulatedConfig();
        setPage(cfg, "home", [
            s("hero_card_float", { title_i18n: { ar: "أهلاً" } }),
            s("trust_badge_row", { items: [{ label_i18n: { ar: "الدفع عند الاستلام" } }] }),
            s("product_grid"),
            s("testimonial_cards", { items: [{ quote_i18n: { ar: "ممتاز" } }] }),
        ]);
        setPage(cfg, "product", [
            s("pdp_direct_order", { delivery_sla_i18n: { ar: "توصيل خلال 24 ساعة" } }),
            s("product_reviews"),
        ]);
        cfg.globals = {
            ...cfg.globals,
            footer: s("site_footer", {
                layout: "boutique",
                columns: [],
                show_cod_badge: true,
                newsletter: { enabled: true },
            }),
        };
        return cfg;
    }

    it("passes trust, testimonials, newsletter and delivery for a store built from the signature template", () => {
        const cfg = storeLikeScheniders();
        for (const id of [
            "home_has_trust_strip",
            "home_has_testimonials",
            "home_has_newsletter",
            "pdp_has_delivery_promise",
            "at_least_one_testimonial",
        ]) {
            expect(status(cfg, id), id).toBe("pass");
        }
    });

    it("a hidden trust row does not count", () => {
        const cfg = storeLikeScheniders();
        const home = cfg.pages.find((p) => p.page_id === "home");
        const row = home?.sections.find((x) => x.type === "trust_badge_row");
        if (row) row.enabled = false;
        expect(status(cfg, "home_has_trust_strip")).toBe("warn");
    });

    it("the bento footer has no newsletter row, so its newsletter settings do not count", () => {
        const cfg = storeLikeScheniders();
        const footer = cfg.globals?.footer;
        if (footer) footer.base = { ...footer.base, layout: "bento" };
        expect(status(cfg, "home_has_newsletter")).toBe("warn");
    });

    it("an order card with an empty delivery line does not count as a delivery promise", () => {
        const cfg = storeLikeScheniders();
        setPage(cfg, "product", [s("pdp_direct_order", { delivery_sla_i18n: { ar: " " } })]);
        expect(status(cfg, "pdp_has_delivery_promise")).toBe("warn");
    });
});

describe("runHealthChecks — at_least_one_image_per_hero", () => {
    it("a hero that keeps its picture in bg_image_url has an image", () => {
        const cfg = fullyPopulatedConfig();
        setPage(cfg, "home", [s("hero_card_float", { bg_image_url: "https://cdn/hero.webp" })]);
        const c = runHealthChecks(cfg).checks.find((c) => c.id === "at_least_one_image_per_hero");
        expect(c?.status).toBe("pass");
    });

    it("opens the hero that needs a picture, on its own page", () => {
        const cfg = fullyPopulatedConfig();
        const hero = s("hero_card_float", {});
        setPage(cfg, "about", [hero]);
        const c = runHealthChecks(cfg).checks.find((c) => c.id === "at_least_one_image_per_hero");
        expect(c?.status).toBe("warn");
        // ...and points at the field the picture goes in.
        expect(c?.fix_action?.go_to).toEqual({
            kind: "section",
            page_id: "about",
            section_id: hero.id,
            field: "bg_image_url",
        });
    });
});

describe("runHealthChecks — brand_colors_readable", () => {
    const find = (cfg: ReturnType<typeof fullyPopulatedConfig>) =>
        runHealthChecks(cfg).checks.find((c) => c.id === "brand_colors_readable");

    it("passes dark text and a strong main colour on a light page", () => {
        const cfg = fullyPopulatedConfig();
        cfg.brand_kit = { ...cfg.brand_kit, colors: { ...cfg.brand_kit.colors, surface: "#ffffff", ink: "#111111", primary: "#1d4ed8" } };
        expect(find(cfg)?.status).toBe("pass");
    });

    it("warns when the main colour is weak but visible", () => {
        const cfg = fullyPopulatedConfig();
        cfg.brand_kit = { ...cfg.brand_kit, colors: { ...cfg.brand_kit.colors, surface: "#ffffff", ink: "#111111", primary: "#d4a017" } };
        const c = find(cfg);
        expect(c?.status).toBe("warn");
        expect(c?.fix_action?.go_to).toEqual({ kind: "settings", key: "brand_kit" });
    });

    it("fails when the main colour nearly disappears into the page", () => {
        const cfg = fullyPopulatedConfig();
        cfg.brand_kit = { ...cfg.brand_kit, colors: { ...cfg.brand_kit.colors, surface: "#ffffff", ink: "#111111", primary: "#f7db17" } };
        const c = find(cfg);
        expect(c?.status).toBe("fail");
        expect(c?.blocks_publish).toBeUndefined();
    });

    it("fails when body text is too light to read", () => {
        const cfg = fullyPopulatedConfig();
        cfg.brand_kit = { ...cfg.brand_kit, colors: { ...cfg.brand_kit.colors, surface: "#ffffff", ink: "#aaaaaa", primary: "#1d4ed8" } };
        const c = find(cfg);
        expect(c?.status).toBe("fail");
        expect(c?.message).toMatch(/text/);
    });
});

describe("healthBand", () => {
    it("is great for a clean store", () => {
        const cfg = fullyPopulatedConfig();
        cfg.brand_kit = { ...cfg.brand_kit, colors: { ...cfg.brand_kit.colors, surface: "#ffffff", ink: "#111111", primary: "#1d4ed8" } };
        const report = runHealthChecks(cfg);
        expect(report.checks.some((c) => c.status === "fail")).toBe(false);
        expect(report.score).toBeGreaterThanOrEqual(85);
        expect(healthBand(report)).toBe("great");
    });

    it("caps a high score at almost while any check fails", () => {
        const cfg = fullyPopulatedConfig();
        cfg.brand_kit = { ...cfg.brand_kit, colors: { ...cfg.brand_kit.colors, surface: "#ffffff", ink: "#111111", primary: "#f7db17" } };
        const report = runHealthChecks(cfg);
        expect(report.score).toBeGreaterThanOrEqual(85);
        expect(healthBand(report)).toBe("almost");
    });

    it("is needs_work while a check blocks publish", () => {
        const report = runHealthChecks(fullyPopulatedConfig());
        const blocked = {
            ...report,
            checks: [{ ...report.checks[0], status: "fail" as const, blocks_publish: true }, ...report.checks.slice(1)],
        };
        expect(healthBand(blocked)).toBe("needs_work");
    });
});
