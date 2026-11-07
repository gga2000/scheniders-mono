// =====================================================================
// Health-Score Launch Checklist — rules engine
// =====================================================================
// Pure, framework-free evaluator over `StoreConfigV2`. Produces a 0–100
// score, per-category sub-scores, and an ordered list of `CheckResult`s
// each with a fix action that deep-links to the right editor panel.
//
// Used by:
//  - apps/platform/components/store-builder-v2/health-checklist-screen.tsx
//  - apps/platform/components/store-builder-v2/editor-shell.tsx (to gate
//    the Publish button on `blocks_publish` failures)
// =====================================================================

import type { LocaleCode, PageId, SectionInstance, StoreConfigV2 } from "./types/store-config-v2";
import { SUPPORTED_LOCALES } from "./types/store-config-v2";

/* ─────────────────────────────────────────────────────────────────── */
/* Public types                                                        */
/* ─────────────────────────────────────────────────────────────────── */

export type RuleStatus = "pass" | "warn" | "fail";

export type HealthCategory =
    | "ad_compliance"
    | "seo"
    | "performance"
    | "conversion"
    | "trust"
    | "content";

export interface FixAction {
    /** Short button label. */
    label: string;
    /** Editor target — used by the platform to deep-link. */
    go_to:
        | {
              kind: "settings";
              key:
                  | "brand_kit"
                  | "versions"
                  | "scheduled"
                  | "experiments"
                  | "segments"
                  | "health"
                  | "pixels";
          }
        /** `tab: "seo"` opens the page's SEO panel instead of its sections;
         *  `open: "add_section"` lands on the page with the section picker
         *  open, for fixes whose remedy is "add a section here". */
        | { kind: "page"; page_id: PageId; tab?: "seo"; open?: "add_section" }

        | { kind: "section"; page_id: PageId; section_id: string }
        | { kind: "external"; href: string };
}

export interface CheckResult {
    status: RuleStatus;
    /** Short message (English; can localize later). */
    message?: string;
    /** What the merchant should do. */
    fix_action?: FixAction;
    /** Hard block on publish (only allowed when status === "fail"). */
    blocks_publish?: boolean;
}

/**
 * Store facts that live outside `StoreConfigV2` but decide what shoppers
 * see. The storefront resolves its WhatsApp and call numbers from the config
 * first and then from older tenant fields (Settings, signup), so a check that
 * reads only the config warns about a number the store is already showing.
 * Callers resolve these with the storefront's own helpers
 * (`resolveTenantWhatsapp` / `resolveTenantPhone`) and pass them in.
 */
export interface HealthContext {
    /** The WhatsApp number the storefront will show, or null. */
    whatsapp?: string | null;
    /** The call number the storefront footer will show, or null. */
    phone?: string | null;
    /** A share image the storefront uses from outside the config (older
     *  stores keep it in the legacy SEO settings), or null. */
    ogImage?: string | null;
}

export interface HealthCheck {
    id: string;
    category: HealthCategory;
    weight: number;
    evaluate: (cfg: StoreConfigV2, ctx: HealthContext) => CheckResult;
}

export interface HealthReport {
    /** 0–100 weighted score across all checks. */
    score: number;
    /** Per-category 0–100 score (same weighted formula scoped to the category). */
    category_scores: Record<HealthCategory, number>;
    /** All 30 checks evaluated, with merged metadata. */
    checks: Array<HealthCheck & CheckResult>;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Category weights                                                    */
/* ─────────────────────────────────────────────────────────────────── */

const CATEGORY_WEIGHT: Record<HealthCategory, number> = {
    ad_compliance: 10,
    conversion: 6,
    seo: 4,
    trust: 4,
    content: 3,
    performance: 2,
};

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                             */
/* ─────────────────────────────────────────────────────────────────── */

function findPage(cfg: StoreConfigV2, id: PageId): PageId extends never ? never : ReturnType<typeof getPage> {
    return getPage(cfg, id) as never;
}

function getPage(cfg: StoreConfigV2, id: PageId) {
    return cfg.pages.find((p) => p.page_id === id);
}

function pageSections(cfg: StoreConfigV2, id: PageId): SectionInstance[] {
    return getPage(cfg, id)?.sections ?? [];
}

/** Enabled sections of one page: a hidden section shows the shopper nothing. */
function livePageSections(cfg: StoreConfigV2, id: PageId): SectionInstance[] {
    return pageSections(cfg, id).filter((s) => s.enabled !== false);
}

/** Section types that show the shopper trust badges (COD, delivery, returns). */
const TRUST_SECTION_TYPES: ReadonlySet<string> = new Set(["trust_strip", "trust_badge_row"]);

/** Section types that show other people vouching for the store. */
const SOCIAL_PROOF_SECTION_TYPES: ReadonlySet<string> = new Set([
    "testimonials_carousel",
    "testimonial_cards",
    "founder_note",
    "press_quotes",
]);

/** Footer lockups that render the footer's newsletter row (bento has none). */
const FOOTER_LAYOUTS_WITH_NEWSLETTER: ReadonlySet<string> = new Set(["info_panel", "boutique"]);

function hasI18nText(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    return Object.values(value as Record<string, unknown>).some(
        (v) => typeof v === "string" && v.trim().length > 0,
    );
}

/** True when the shopper can sign up for news somewhere on the store. */
function hasNewsletterCapture(cfg: StoreConfigV2): boolean {
    if (livePageSections(cfg, "home").some((s) => s.type === "newsletter_inline")) return true;
    if (cfg.globals?.newsletter_popup) return true;
    const footer = cfg.globals?.footer;
    if (!footer || footer.enabled === false) return false;
    const base = footer.base as { layout?: unknown; newsletter?: { enabled?: unknown } };
    return (
        typeof base.layout === "string" &&
        FOOTER_LAYOUTS_WITH_NEWSLETTER.has(base.layout) &&
        base.newsletter?.enabled === true
    );
}

/** True when the product page states a delivery time: the dedicated section,
 *  or an order card whose delivery line is filled in. */
function productPageHasDeliveryPromise(cfg: StoreConfigV2): boolean {
    return livePageSections(cfg, "product").some(
        (s) =>
            s.type === "delivery_promise" ||
            hasI18nText((s.base as { delivery_sla_i18n?: unknown }).delivery_sla_i18n),
    );
}

function allEnabledSections(cfg: StoreConfigV2): SectionInstance[] {
    const out: SectionInstance[] = [];
    for (const p of cfg.pages) {
        for (const s of p.sections) {
            if (s.enabled !== false) out.push(s);
        }
    }
    // Globals as well.
    const g = cfg.globals ?? {};
    for (const k of Object.keys(g) as Array<keyof typeof g>) {
        const inst = g[k];
        if (inst && (inst as SectionInstance).enabled !== false) {
            out.push(inst as SectionInstance);
        }
    }
    return out;
}

function resolveStr(v: unknown): string {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const en = o.en;
        if (typeof en === "string") return en;
        for (const val of Object.values(o)) {
            if (typeof val === "string" && val.length > 0) return val;
        }
    }
    return "";
}

/** Walk an arbitrary object/array tree and yield every string prop value. */
function* walkStrings(value: unknown): Generator<string> {
    if (value == null) return;
    if (typeof value === "string") {
        yield value;
        return;
    }
    if (Array.isArray(value)) {
        for (const v of value) yield* walkStrings(v);
        return;
    }
    if (typeof value === "object") {
        for (const v of Object.values(value as Record<string, unknown>)) {
            yield* walkStrings(v);
        }
    }
}

/** Walk an object looking for a key by name (deep). Returns first match. */
function findKey(value: unknown, predicate: (key: string) => boolean): unknown {
    if (value == null) return undefined;
    if (Array.isArray(value)) {
        for (const v of value) {
            const r = findKey(v, predicate);
            if (r !== undefined) return r;
        }
        return undefined;
    }
    if (typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (predicate(k) && v != null && v !== "") return v;
            const r = findKey(v, predicate);
            if (r !== undefined) return r;
        }
    }
    return undefined;
}

/** Visit every plain-object node in a value (recursing through arrays). */
function walkObjects(
    value: unknown,
    visit: (obj: Record<string, unknown>) => void,
): void {
    if (value == null) return;
    if (Array.isArray(value)) {
        for (const v of value) walkObjects(v, visit);
        return;
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        visit(obj);
        for (const v of Object.values(obj)) walkObjects(v, visit);
    }
}

/** Content pages that should stay indexable (functional pages excluded). */
const SEO_IMPORTANT_PAGES: readonly PageId[] = [
    "home",
    "about",
    "faq",
    "contact",
    "policy_shipping",
    "policy_returns",
    "policy_privacy",
    "policy_terms",
];

/** A link value that points nowhere (placeholder / dead). Empty is NOT dead —
 *  sections hide the CTA when a link is blank. */
function isDeadLink(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const s = value.trim().toLowerCase();
    if (s === "") return false;
    return (
        s === "#" ||
        s === "javascript:void(0)" ||
        s.includes("localhost") ||
        s.includes("example.com") ||
        s.includes("yourdomain") ||
        s.includes("todo")
    );
}

const LOCALE_LABEL: Record<LocaleCode, string> = {
    ar: "Arabic",
    en: "English",
    ku: "Kurdish",
};

const LOCALE_KEY_SET = new Set<string>(SUPPORTED_LOCALES);

/** A translatable field: a plain object keyed ONLY by locale codes (e.g.
 *  `{ en, ar }`), with at least one string value. The all-keys-are-locales
 *  guard avoids false positives on ordinary objects that merely have an
 *  `en`/`ar` property. */
function isI18nObject(v: unknown): v is Record<string, unknown> {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const keys = Object.keys(v as Record<string, unknown>);
    if (keys.length === 0 || !keys.every((k) => LOCALE_KEY_SET.has(k))) {
        return false;
    }
    return Object.values(v as Record<string, unknown>).some(
        (x) => typeof x === "string",
    );
}

/** Walk a props tree; for every i18n field, tally how many of `locales`
 *  have non-empty content. Does not recurse into an i18n leaf. */
function tallyI18n(
    value: unknown,
    locales: LocaleCode[],
    acc: { total: number; filled: Record<string, number> },
): void {
    if (value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
        for (const v of value) tallyI18n(v, locales, acc);
        return;
    }
    if (isI18nObject(value)) {
        acc.total += 1;
        for (const l of locales) {
            const cell = (value as Record<string, unknown>)[l];
            if (typeof cell === "string" && cell.trim().length > 0) {
                acc.filled[l] += 1;
            }
        }
        return;
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
        tallyI18n(v, locales, acc);
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Fix action helpers                                                  */
/* ─────────────────────────────────────────────────────────────────── */

function fixPage(page_id: PageId, label: string): FixAction {
    return { label, go_to: { kind: "page", page_id } };
}

/** Fix whose remedy is adding a section: opens the page with the picker up. */
function fixAddSection(page_id: PageId, label: string): FixAction {
    return { label, go_to: { kind: "page", page_id, open: "add_section" } };
}

function fixSettings(
    key: FixAction["go_to"] extends infer T ? T extends { kind: "settings"; key: infer K } ? K : never : never,
    label: string,
): FixAction {
    return { label, go_to: { kind: "settings", key } };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Individual checks                                                   */
/* ─────────────────────────────────────────────────────────────────── */

/** Convenience builder. */
function check(
    id: string,
    category: HealthCategory,
    weight: number,
    evaluate: (cfg: StoreConfigV2, ctx: HealthContext) => CheckResult,
): HealthCheck {
    return { id, category, weight, evaluate };
}

function policyHasContent(cfg: StoreConfigV2, page_id: PageId, label: string): CheckResult {
    const sections = pageSections(cfg, page_id);
    if (sections.length === 0) {
        return {
            status: "fail",
            message: `${label} page has no content — required for ad platforms.`,
            blocks_publish: true,
            fix_action: fixPage(page_id, `Edit ${label}`),
        };
    }
    return { status: "pass" };
}

export const HEALTH_CHECKS: HealthCheck[] = [
    /* ── Ad compliance (8) ───────────────────────────────────────── */
    check("privacy_policy_has_content", "ad_compliance", 1, (cfg) =>
        policyHasContent(cfg, "policy_privacy", "Privacy policy"),
    ),
    check("shipping_policy_has_content", "ad_compliance", 1, (cfg) =>
        policyHasContent(cfg, "policy_shipping", "Shipping policy"),
    ),
    check("returns_policy_has_content", "ad_compliance", 1, (cfg) =>
        policyHasContent(cfg, "policy_returns", "Returns policy"),
    ),
    check("terms_has_content", "ad_compliance", 1, (cfg) =>
        policyHasContent(cfg, "policy_terms", "Terms & conditions"),
    ),
    check("contact_phone_set", "ad_compliance", 1, (cfg, ctx) => {
        // The footer shows its own phone prop, else the store's call number
        // (ctx.phone, resolved exactly as the footer resolves it).
        if ((ctx.phone ?? "").trim().length > 0) return { status: "pass" };
        const footer = cfg.globals?.footer;
        const phone = footer ? findKey(footer.base, (k) => /phone|contact_phone/.test(k)) : undefined;
        if (phone && resolveStr(phone).trim().length > 0) {
            return { status: "pass" };
        }
        return {
            status: "warn",
            message: "No contact phone detected in footer — add one for ad-platform trust.",
            // The store call number is set in Settings → Business; the footer
            // shows it when it has no phone of its own.
            fix_action: {
                label: "Add store phone",
                go_to: { kind: "external", href: "/settings?section=business" },
            },
        };
    }),
    check("whatsapp_number_set", "ad_compliance", 1, (cfg, ctx) => {
        // The store-level commerce config (what the onboarding wizard writes),
        // else the number the storefront falls back to (ctx.whatsapp: older
        // Settings/signup fields). Section-level numbers count too.
        if ((cfg.commerce?.whatsapp_number ?? "").trim().length > 0) {
            return { status: "pass" };
        }
        if ((ctx.whatsapp ?? "").trim().length > 0) return { status: "pass" };
        for (const s of allEnabledSections(cfg)) {
            const w = findKey(
                s.base,
                (k) => /^wa_number$|^whatsapp_number$|^whatsapp$/.test(k),
            );
            if (w && resolveStr(w).trim().length > 0) return { status: "pass" };
        }
        return {
            status: "warn",
            message: "No WhatsApp number set — strongly recommended for Iraq.",
            fix_action: fixPage("home", "Add WhatsApp number"),
        };
    }),
    check("pixel_or_gtm_configured", "ad_compliance", 1, (cfg) => {
        const pixels = cfg.globals?.analytics_pixels;
        if (!pixels) {
            return {
                status: "fail",
                message: "No analytics pixel configured — required for ad campaigns.",
                blocks_publish: true,
                fix_action: fixSettings("pixels", "Configure pixels"),
            };
        }
        let hasAny = false;
        for (const v of walkStrings(pixels.base)) {
            if (v.trim().length > 0) {
                hasAny = true;
                break;
            }
        }
        if (!hasAny) {
            return {
                status: "fail",
                message: "Pixel config is empty — fill in at least one pixel id.",
                blocks_publish: true,
                fix_action: fixSettings("pixels", "Configure pixels"),
            };
        }
        return { status: "pass" };
    }),
    check("og_image_set", "ad_compliance", 1, (cfg, ctx) => {
        // The storefront falls back to the home page's SEO image for every
        // page's link preview (storeOgImage), so either one is enough.
        const og =
            cfg.brand_kit?.identity?.og_image_url?.trim() ||
            ctx.ogImage?.trim() ||
            getPage(cfg, "home")?.meta?.og_image_url?.trim();
        if (og) return { status: "pass" };
        return {
            status: "fail",
            message: "No social-share image — ad previews will be ugly.",
            blocks_publish: true,
            fix_action: fixSettings("brand_kit", "Upload OG image"),
        };
    }),

    /* ── SEO (5) ─────────────────────────────────────────────────── */
    check("home_meta_title", "seo", 1, (cfg) => {
        const home = getPage(cfg, "home");
        const title = resolveStr(home?.meta?.title);
        if (title.trim().length > 0) return { status: "pass" };
        return {
            status: "fail",
            message: "Home has no meta title — search results will look broken.",
            fix_action: { label: "Edit Home SEO", go_to: { kind: "page", page_id: "home", tab: "seo" } },
        };
    }),
    check("home_meta_description", "seo", 1, (cfg) => {
        const home = getPage(cfg, "home");
        const desc = resolveStr(home?.meta?.description);
        if (desc.trim().length > 0) return { status: "pass" };
        return {
            status: "warn",
            message: "Home has no meta description — Google will guess one.",
            fix_action: { label: "Edit Home SEO", go_to: { kind: "page", page_id: "home", tab: "seo" } },
        };
    }),
    check("every_page_has_meta_title", "seo", 1, (cfg) => {
        // Functional pages (cart/checkout/search/404) aren't crawlable content
        // and don't need an SEO title. Every other defined page renders a real
        // crawlable URL — even with zero sections it falls back to a legacy
        // template — so it must be checked regardless of section count.
        // Product and category templates are titled per item by the
        // storefront ("<product> — <store>"), so a template title is never
        // used on any live URL and must not count as missing.
        const NON_SEO_PAGES: ReadonlySet<PageId> = new Set([
            "product",
            "category",
            "search",
            "cart",
            "checkout",
            "checkout_success",
            "track",
            "not_found",
        ]);
        const missing: PageId[] = [];
        for (const p of cfg.pages) {
            if (NON_SEO_PAGES.has(p.page_id)) continue;
            if (p.meta?.noindex) continue; // intentionally not indexed
            const t = resolveStr(p.meta?.title);
            if (!t.trim()) missing.push(p.page_id);
        }
        if (missing.length === 0) return { status: "pass" };
        return {
            status: "warn",
            message: `${missing.length} page(s) missing meta title: ${missing.join(", ")}.`,
            fix_action: {
                label: "Fix meta titles",
                go_to: { kind: "page", page_id: missing[0], tab: "seo" },
            },
        };
    }),
    check("business_name_set", "seo", 1, (cfg) => {
        const name = cfg.brand_kit?.identity?.name?.trim();
        if (name) return { status: "pass" };
        return {
            status: "fail",
            message: "Business name is empty — set it in Brand Kit.",
            fix_action: fixSettings("brand_kit", "Set business name"),
        };
    }),
    check("tagline_set", "seo", 1, (cfg) => {
        const tagline = resolveStr(cfg.brand_kit?.identity?.tagline);
        if (tagline.trim()) return { status: "pass" };
        return {
            status: "warn",
            message: "Tagline is empty — used as the store description when shoppers save it to their phone.",
            fix_action: fixSettings("brand_kit", "Add tagline"),
        };
    }),
    check("important_pages_indexable", "seo", 1, (cfg) => {
        // H3: an important content page set to noindex won't be listed by Google.
        // noindex on the home page is almost always a mistake → fail.
        const noindexed = SEO_IMPORTANT_PAGES.filter(
            (id) => getPage(cfg, id)?.meta?.noindex === true,
        );
        if (noindexed.length === 0) return { status: "pass" };
        const homeHidden = noindexed.includes("home");
        return {
            status: homeHidden ? "fail" : "warn",
            message: homeHidden
                ? "Home page is set to noindex — Google can't list your store. Remove it unless intentional."
                : `${noindexed.length} important page(s) set to noindex — Google won't list them.`,
            fix_action: fixPage(noindexed[0], "Review noindex"),
        };
    }),
    check("images_have_alt_text", "seo", 1, (cfg) => {
        // H5: only flag images on sections that DO expose an alt field but left
        // it empty (decorative images without an alt field are skipped).
        let missing = 0;
        for (const s of allEnabledSections(cfg)) {
            walkObjects(s.base, (obj) => {
                const imgKey = Object.keys(obj).find((k) =>
                    /(^image_url$|_image_url$|^image$|_image$)/.test(k),
                );
                if (!imgKey || !resolveStr(obj[imgKey]).trim()) return;
                const altKey = Object.keys(obj).find((k) =>
                    /(^alt$|^image_alt$|_alt$)/.test(k),
                );
                if (!altKey) return; // no alt field → decorative, skip
                if (!resolveStr(obj[altKey]).trim()) missing++;
            });
        }
        if (missing === 0) return { status: "pass" };
        return {
            status: "warn",
            message: `${missing} image${missing === 1 ? "" : "s"} missing alt text — hurts accessibility + image SEO.`,
            fix_action: fixPage("home", "Add image alt text"),
        };
    }),
    check("no_dead_cta_links", "conversion", 1, (cfg) => {
        // H6: CTA links pointing at placeholders ("#", localhost, example.com)
        // silently kill conversion. Empty links are intentional (CTA hidden).
        let dead = 0;
        for (const s of allEnabledSections(cfg)) {
            walkObjects(s.base, (obj) => {
                for (const [k, v] of Object.entries(obj)) {
                    // CTA/link fields only — not image_url etc.
                    if (/(href$|^url$|^link_url$)/.test(k) && isDeadLink(v)) {
                        dead++;
                    }
                }
            });
        }
        if (dead === 0) return { status: "pass" };
        return {
            status: "warn",
            message: `${dead} link${dead === 1 ? "" : "s"} point nowhere (#, localhost, placeholder) — fix before launch.`,
            fix_action: fixPage("home", "Fix broken links"),
        };
    }),

    /* ── Performance (4) ─────────────────────────────────────────── */
    check("home_section_count_reasonable", "performance", 1, (cfg) => {
        const n = pageSections(cfg, "home").length;
        if (n <= 12) return { status: "pass" };
        return {
            status: "warn",
            message: `Home has ${n} sections — consider trimming to ≤12 for faster loads.`,
            fix_action: fixPage("home", "Open Home"),
        };
    }),
    check("font_count_reasonable", "performance", 1, (cfg) => {
        const t = cfg.brand_kit?.typography;
        if (!t) return { status: "pass" };
        const fonts = new Set<string>();
        // Every family the storefront downloads, Arabic pairings included.
        for (const f of [t.display, t.body, t.display_ar, t.body_ar]) {
            if (f) fonts.add(f);
        }
        if (fonts.size > 2) {
            return {
                status: "warn",
                message: `Using ${fonts.size} distinct font families — heavier page load.`,
                fix_action: fixSettings("brand_kit", "Tune typography"),
            };
        }
        return { status: "pass" };
    }),
    check("logo_uploaded", "performance", 1, (cfg) => {
        const logo = cfg.brand_kit?.identity?.logo_url;
        if (logo && logo.trim()) return { status: "pass" };
        return {
            status: "warn",
            message: "No logo uploaded.",
            fix_action: fixSettings("brand_kit", "Upload logo"),
        };
    }),
    check("favicon_uploaded", "performance", 1, (cfg) => {
        const fav = cfg.brand_kit?.identity?.favicon_url;
        if (fav && fav.trim()) return { status: "pass" };
        return {
            status: "warn",
            message: "No favicon — browser tab will show a generic icon.",
            fix_action: fixSettings("brand_kit", "Upload favicon"),
        };
    }),

    /* ── Conversion (7) ──────────────────────────────────────────── */
    check("home_has_hero", "conversion", 1, (cfg) => {
        const hit = pageSections(cfg, "home").some((s) => s.type.startsWith("hero_"));
        if (hit) return { status: "pass" };
        return {
            status: "fail",
            message: "Home has no hero — first impression is empty.",
            fix_action: fixAddSection("home", "Add a hero"),
        };
    }),
    check("home_has_trust_strip", "conversion", 1, (cfg) => {
        const hit = livePageSections(cfg, "home").some((s) => TRUST_SECTION_TYPES.has(s.type));
        if (hit) return { status: "pass" };
        return {
            status: "warn",
            message: "Home has no trust strip — adds credibility above the fold.",
            fix_action: fixAddSection("home", "Add trust strip"),
        };
    }),
    check("home_has_product_grid", "conversion", 1, (cfg) => {
        const hit = pageSections(cfg, "home").some((s) => s.type === "product_grid");
        if (hit) return { status: "pass" };
        return {
            status: "fail",
            message: "Home has no product grid — visitors can't browse.",
            fix_action: fixAddSection("home", "Add product grid"),
        };
    }),
    check("home_has_testimonials", "conversion", 1, (cfg) => {
        const hit = livePageSections(cfg, "home").some((s) =>
            SOCIAL_PROOF_SECTION_TYPES.has(s.type),
        );
        if (hit) return { status: "pass" };
        return {
            status: "warn",
            message: "Home has no testimonials or founder note — social proof builds trust.",
            fix_action: fixAddSection("home", "Add testimonials"),
        };
    }),
    check("home_has_newsletter", "conversion", 1, (cfg) => {
        if (hasNewsletterCapture(cfg)) return { status: "pass" };
        return {
            status: "warn",
            message: "No newsletter capture — you're losing the visitors who don't buy today.",
            fix_action: fixAddSection("home", "Add newsletter"),
        };
    }),
    check("pdp_has_delivery_promise", "conversion", 1, (cfg) => {
        if (productPageHasDeliveryPromise(cfg)) return { status: "pass" };
        return {
            status: "warn",
            message: "Product page has no delivery promise — boosts conversion.",
            fix_action: fixPage("product", "Edit Product page"),
        };
    }),
    check("cart_has_promo_or_upsell", "conversion", 1, (cfg) => {
        const cart = pageSections(cfg, "cart");
        const hit = cart.some(
            (s) =>
                s.type === "promo_banner" ||
                s.type === "product_grid" ||
                s.type === "free_gift_strip",
        );
        if (hit) return { status: "pass" };
        return {
            status: "warn",
            message: "Cart has no promo or upsell module — leave AOV on the table.",
            fix_action: fixAddSection("cart", "Add to Cart page"),
        };
    }),

    /* ── Trust (3) ───────────────────────────────────────────────── */
    check("at_least_one_testimonial", "trust", 1, (cfg) => {
        // Having the section at all counts; product reviews are shopper proof too.
        const hit = allEnabledSections(cfg).some(
            (s) => SOCIAL_PROOF_SECTION_TYPES.has(s.type) || s.type === "product_reviews",
        );
        if (hit) return { status: "pass" };
        return {
            status: "warn",
            message: "No testimonials anywhere on the store.",
            fix_action: fixAddSection("home", "Add testimonials"),
        };
    }),
    check("social_links_set", "trust", 1, (cfg) => {
        const footer = cfg.globals?.footer;
        if (!footer) {
            return {
                status: "warn",
                message: "No footer configured — add social links there.",
                fix_action: fixSettings("brand_kit", "Configure footer"),
            };
        }
        const hit = findKey(
            footer.base,
            (k) => /instagram|facebook|tiktok|twitter|youtube|telegram|social/.test(k),
        );
        if (hit && resolveStr(hit).trim()) return { status: "pass" };
        return {
            status: "warn",
            message: "Footer has no social links.",
            fix_action: fixSettings("brand_kit", "Edit footer"),
        };
    }),
    check("contact_page_populated", "trust", 1, (cfg) => {
        const c = pageSections(cfg, "contact");
        if (c.length > 0) return { status: "pass" };
        return {
            status: "warn",
            message: "Contact page is empty.",
            fix_action: fixPage("contact", "Edit contact"),
        };
    }),

    /* ── Content (4) ─────────────────────────────────────────────── */
    check("home_has_content", "content", 2, (cfg) => {
        // EC11: a home page with no ENABLED sections renders an empty
        // storefront (just header/footer chrome). Blocks publish — an empty
        // home is never intentional, and historically it silently fell back
        // to the legacy template (split-brain store). All-hidden counts as
        // empty: a section toggled off contributes nothing to the page.
        const enabled = pageSections(cfg, "home").filter((s) => s.enabled !== false);
        if (enabled.length === 0) {
            return {
                status: "fail",
                message: "Home page has no visible sections — add at least one.",
                blocks_publish: true,
                fix_action: fixPage("home", "Build home page"),
            };
        }
        return { status: "pass" };
    }),
    check("at_least_one_image_per_hero", "content", 1, (cfg) => {
        // Every image key a hero section stores its picture under, video
        // included (hero_card_float keeps it in `bg_image_url`).
        const IMAGE_KEY = /^(image_url|image|bg_url|bg_image_url|background_image_url|media_url|video_url|poster_url)$/;
        const missing: Array<{ page_id: PageId; section_id: string }> = [];
        for (const page of cfg.pages) {
            for (const s of page.sections) {
                if (s.enabled === false || !s.type.startsWith("hero_")) continue;
                const img = findKey(s.base, (k) => IMAGE_KEY.test(k));
                if (!img || !resolveStr(img).trim()) {
                    missing.push({ page_id: page.page_id, section_id: s.id });
                }
            }
        }
        const first = missing[0];
        if (!first) return { status: "pass" };
        return {
            status: "warn",
            message: `${missing.length} hero section(s) missing an image (${[...new Set(missing.map((m) => m.page_id))].join(", ")}).`,
            // Open the first hero that needs a picture, not always Home.
            fix_action: {
                label: "Add hero image",
                go_to: { kind: "section", page_id: first.page_id, section_id: first.section_id },
            },
        };
    }),
    check("every_section_enabled_has_content", "content", 1, (cfg) => {
        const empty: SectionInstance[] = [];
        for (const s of allEnabledSections(cfg)) {
            // Check known text-bearing keys; resolve EN locale.
            const hits: string[] = [];
            for (const v of walkStrings(s.base)) {
                if (v.trim().length > 0) hits.push(v);
            }
            // Also include i18n EN strings deeply.
            if (hits.length === 0) empty.push(s);
        }
        if (empty.length === 0) return { status: "pass" };
        return {
            status: "warn",
            message: `${empty.length} enabled section(s) have no text content.`,
            fix_action: fixPage("home", "Review empty sections"),
        };
    }),
    check("no_lorem_ipsum", "content", 1, (cfg) => {
        for (const p of cfg.pages) {
            for (const s of p.sections) {
                for (const v of walkStrings(s.base)) {
                    if (/lorem ipsum/i.test(v)) {
                        return {
                            status: "fail",
                            message: `Lorem ipsum placeholder text found on ${p.page_id}.`,
                            fix_action: { label: "Find & fix", go_to: { kind: "page", page_id: p.page_id } },
                        };
                    }
                }
            }
        }
        const globals = cfg.globals ?? {};
        for (const inst of Object.values(globals)) {
            if (!inst) continue;
            for (const v of walkStrings((inst as SectionInstance).base)) {
                if (/lorem ipsum/i.test(v)) {
                    return {
                        status: "fail",
                        message: "Lorem ipsum placeholder text found in a global section.",
                        fix_action: fixSettings("brand_kit", "Edit globals"),
                    };
                }
            }
        }
        return { status: "pass" };
    }),
    check("translations_complete", "content", 1, (cfg) => {
        // Warn (never block) when a merchant has ENABLED a secondary locale
        // but left it largely untranslated — those visitors would silently
        // get fallback text. The default locale is excluded (it's the source).
        const enabled =
            cfg.enabled_locales && cfg.enabled_locales.length > 0
                ? cfg.enabled_locales
                : // Same default the storefront serves (resolveVisitorLocale).
                  (["ar"] as const);
        const others = enabled.filter((l) => l !== cfg.default_locale);
        if (others.length === 0) return { status: "pass" };

        const acc = {
            total: 0,
            filled: Object.fromEntries(others.map((l) => [l, 0])) as Record<string, number>,
        };
        for (const s of allEnabledSections(cfg)) tallyI18n(s.base, others, acc);
        if (acc.total === 0) return { status: "pass" };

        const THRESHOLD = 0.6;
        let worst: LocaleCode | null = null;
        let worstPct = 1;
        for (const l of others) {
            const pct = acc.filled[l] / acc.total;
            if (pct < worstPct) {
                worstPct = pct;
                worst = l;
            }
        }
        if (worst && worstPct < THRESHOLD) {
            return {
                status: "warn",
                message: `${LOCALE_LABEL[worst]} content is only ${Math.round(worstPct * 100)}% translated — enabled-locale visitors see fallback text.`,
            };
        }
        return { status: "pass" };
    }),
    check("default_locale_enabled", "content", 1, (cfg) => {
        // The default locale is the source every other locale falls back to. If
        // it isn't itself in the enabled list, the storefront can never serve
        // the source language and visitors get unpredictable fallbacks.
        const enabled = cfg.enabled_locales ?? [];
        if (enabled.length === 0) return { status: "pass" };
        if (enabled.includes(cfg.default_locale)) return { status: "pass" };
        return {
            status: "warn",
            message: `Default language (${LOCALE_LABEL[cfg.default_locale]}) isn't in your enabled languages — add it or pick an enabled default.`,
        };
    }),
];

/* ─────────────────────────────────────────────────────────────────── */
/* Runner                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function statusToPoints(s: RuleStatus): number {
    if (s === "pass") return 1;
    if (s === "warn") return 0.25;
    return 0;
}

export function runHealthChecks(cfg: StoreConfigV2, ctx: HealthContext = {}): HealthReport {
    const evaluated = HEALTH_CHECKS.map((c) => {
        const r = c.evaluate(cfg, ctx);
        return { ...c, ...r };
    });

    let total = 0;
    let max = 0;
    const catTotal: Record<HealthCategory, number> = {
        ad_compliance: 0,
        conversion: 0,
        seo: 0,
        trust: 0,
        content: 0,
        performance: 0,
    };
    const catMax: Record<HealthCategory, number> = {
        ad_compliance: 0,
        conversion: 0,
        seo: 0,
        trust: 0,
        content: 0,
        performance: 0,
    };

    for (const c of evaluated) {
        const w = c.weight * CATEGORY_WEIGHT[c.category];
        const pts = statusToPoints(c.status) * w;
        total += pts;
        max += w;
        catTotal[c.category] += pts;
        catMax[c.category] += w;
    }

    const category_scores: Record<HealthCategory, number> = {
        ad_compliance: 0,
        conversion: 0,
        seo: 0,
        trust: 0,
        content: 0,
        performance: 0,
    };
    for (const k of Object.keys(category_scores) as HealthCategory[]) {
        category_scores[k] = catMax[k] === 0 ? 0 : Math.round((100 * catTotal[k]) / catMax[k]);
    }

    const score = max === 0 ? 0 : Math.round((100 * total) / max);

    // Order: failing first, then warn, then pass; stable within group.
    evaluated.sort((a, b) => severity(a.status) - severity(b.status));

    return { score, category_scores, checks: evaluated };
}

function severity(s: RuleStatus): number {
    if (s === "fail") return 0;
    if (s === "warn") return 1;
    return 2;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers exposed for the editor-shell publish gate                   */
/* ─────────────────────────────────────────────────────────────────── */

export function blockingChecks(report: HealthReport): Array<HealthCheck & CheckResult> {
    return report.checks.filter((c) => c.status === "fail" && c.blocks_publish === true);
}
