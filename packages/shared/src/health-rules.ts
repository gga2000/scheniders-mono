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
              key: "brand_kit" | "versions" | "scheduled" | "experiments" | "segments" | "health";
          }
        | { kind: "page"; page_id: PageId }
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

export interface HealthCheck {
    id: string;
    category: HealthCategory;
    weight: number;
    evaluate: (cfg: StoreConfigV2) => CheckResult;
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
    evaluate: (cfg: StoreConfigV2) => CheckResult,
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
    check("contact_phone_set", "ad_compliance", 1, (cfg) => {
        // Real contact lives outside StoreConfigV2 today; proxy by looking
        // at the footer section instance for a contact card / phone prop.
        const footer = cfg.globals?.footer;
        const phone = footer ? findKey(footer.base, (k) => /phone|contact_phone/.test(k)) : undefined;
        if (phone && resolveStr(phone).trim().length > 0) {
            return { status: "pass" };
        }
        return {
            status: "warn",
            message: "No contact phone detected in footer — add one for ad-platform trust.",
            fix_action: fixPage("contact", "Edit contact"),
        };
    }),
    check("whatsapp_number_set", "ad_compliance", 1, (cfg) => {
        for (const s of allEnabledSections(cfg)) {
            const w = findKey(
                s.base,
                (k) => /^wa_number$|^whatsapp_number$|^whatsapp$/.test(k),
            );
            if (w && resolveStr(w).trim().length > 0) return { status: "pass" };
        }
        return {
            status: "warn",
            message: "No WhatsApp number set on any section — strongly recommended for Iraq.",
            fix_action: fixPage("home", "Add WhatsApp button"),
        };
    }),
    check("pixel_or_gtm_configured", "ad_compliance", 1, (cfg) => {
        const pixels = cfg.globals?.analytics_pixels;
        if (!pixels) {
            return {
                status: "fail",
                message: "No analytics pixel configured — required for ad campaigns.",
                blocks_publish: true,
                fix_action: fixSettings("brand_kit", "Configure pixels"),
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
                fix_action: fixSettings("brand_kit", "Configure pixels"),
            };
        }
        return { status: "pass" };
    }),
    check("og_image_set", "ad_compliance", 1, (cfg) => {
        const og = cfg.brand_kit?.identity?.og_image_url;
        if (og && og.trim().length > 0) return { status: "pass" };
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
            fix_action: fixPage("home", "Edit Home SEO"),
        };
    }),
    check("home_meta_description", "seo", 1, (cfg) => {
        const home = getPage(cfg, "home");
        const desc = resolveStr(home?.meta?.description);
        if (desc.trim().length > 0) return { status: "pass" };
        return {
            status: "warn",
            message: "Home has no meta description — Google will guess one.",
            fix_action: fixPage("home", "Edit Home SEO"),
        };
    }),
    check("every_page_has_meta_title", "seo", 1, (cfg) => {
        // Functional pages (cart/checkout/search/404) aren't crawlable content
        // and don't need an SEO title. Every other defined page renders a real
        // crawlable URL — even with zero sections it falls back to a legacy
        // template — so it must be checked regardless of section count.
        const NON_SEO_PAGES: ReadonlySet<PageId> = new Set([
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
            message: `${missing.length} page(s) missing meta title.`,
            fix_action: fixPage(missing[0], "Fix meta titles"),
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
            message: "Tagline is empty — used in OG previews and metadata.",
            fix_action: fixSettings("brand_kit", "Add tagline"),
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
        if (t.display) fonts.add(t.display);
        if (t.body) fonts.add(t.body);
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
            fix_action: fixPage("home", "Add a hero"),
        };
    }),
    check("home_has_trust_strip", "conversion", 1, (cfg) => {
        const hit = pageSections(cfg, "home").some((s) => s.type === "trust_strip");
        if (hit) return { status: "pass" };
        return {
            status: "warn",
            message: "Home has no trust strip — adds credibility above the fold.",
            fix_action: fixPage("home", "Add trust strip"),
        };
    }),
    check("home_has_product_grid", "conversion", 1, (cfg) => {
        const hit = pageSections(cfg, "home").some((s) => s.type === "product_grid");
        if (hit) return { status: "pass" };
        return {
            status: "fail",
            message: "Home has no product grid — visitors can't browse.",
            fix_action: fixPage("home", "Add product grid"),
        };
    }),
    check("home_has_testimonials", "conversion", 1, (cfg) => {
        const hit = pageSections(cfg, "home").some(
            (s) => s.type === "testimonials_carousel" || s.type === "founder_note",
        );
        if (hit) return { status: "pass" };
        return {
            status: "warn",
            message: "Home has no testimonials or founder note — social proof builds trust.",
            fix_action: fixPage("home", "Add testimonials"),
        };
    }),
    check("home_has_newsletter", "conversion", 1, (cfg) => {
        const hit = pageSections(cfg, "home").some((s) => s.type === "newsletter_inline");
        if (hit || cfg.globals?.newsletter_popup) return { status: "pass" };
        return {
            status: "warn",
            message: "No newsletter capture — you're losing the visitors who don't buy today.",
            fix_action: fixPage("home", "Add newsletter"),
        };
    }),
    check("pdp_has_delivery_promise", "conversion", 1, (cfg) => {
        const hit = pageSections(cfg, "product").some((s) => s.type === "delivery_promise");
        if (hit) return { status: "pass" };
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
            fix_action: fixPage("cart", "Edit Cart"),
        };
    }),

    /* ── Trust (3) ───────────────────────────────────────────────── */
    check("at_least_one_testimonial", "trust", 1, (cfg) => {
        for (const s of allEnabledSections(cfg)) {
            if (s.type === "testimonials_carousel") {
                const items = (s.base as { items?: unknown[] }).items;
                if (Array.isArray(items) && items.length > 0) return { status: "pass" };
                return { status: "pass" }; // having the section at all counts
            }
        }
        return {
            status: "warn",
            message: "No testimonials anywhere on the store.",
            fix_action: fixPage("home", "Add testimonials"),
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

    /* ── Content (3) ─────────────────────────────────────────────── */
    check("at_least_one_image_per_hero", "content", 1, (cfg) => {
        const missing: SectionInstance[] = [];
        for (const s of allEnabledSections(cfg)) {
            if (!s.type.startsWith("hero_")) continue;
            const img = findKey(s.base, (k) => /^image_url$|^image$|^bg_url$/.test(k));
            if (!img || !resolveStr(img).trim()) missing.push(s);
        }
        if (missing.length === 0) return { status: "pass" };
        return {
            status: "warn",
            message: `${missing.length} hero section(s) missing an image.`,
            fix_action: fixPage("home", "Add hero image"),
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
                : SUPPORTED_LOCALES;
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
];

/* ─────────────────────────────────────────────────────────────────── */
/* Runner                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function statusToPoints(s: RuleStatus): number {
    if (s === "pass") return 1;
    if (s === "warn") return 0.25;
    return 0;
}

export function runHealthChecks(cfg: StoreConfigV2): HealthReport {
    const evaluated = HEALTH_CHECKS.map((c) => {
        const r = c.evaluate(cfg);
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
