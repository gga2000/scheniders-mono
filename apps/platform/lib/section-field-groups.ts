// =====================================================================
// Section field groups — Schneiders Builder v2
// =====================================================================
// Classifies each section schema's top-level fields into one of three
// editor groups:
//
//   - "essential"  → content the merchant changes 90% of the time:
//                    localised text (*_i18n), images, repeatable items.
//   - "style"      → visual tweaks: tints, alignment, density, columns.
//   - "logic"      → wiring: href targets, kinds, analytics, limits.
//
// Classification is CONVENTION-BASED on the field name alone — no
// per-section lookup tables. This means every current section and any
// future section is covered automatically.
//
// AutoForm calls `hasFieldGroups(sectionType)` to decide whether to
// render three collapsible accordions or a flat list. It returns true
// for every known section type (defined in KNOWN_SECTION_TYPES below)
// so grouping is universal. Callers that pass an unregistered type
// (e.g. tests that build one-off schemas) continue to get flat render.
//
// AutoForm calls `getFieldGroup(sectionType, fieldPath)` — the first
// arg is accepted for backward compatibility but ignored. Classification
// is based entirely on the field name (leading segment of fieldPath).
// =====================================================================

export type FieldGroup = "essential" | "style" | "logic";

export const FIELD_GROUPS_ORDER: FieldGroup[] = [
    "essential",
    "style",
    "logic",
];

// ─────────────────────────────────────────────────────────────────────
// Convention-based classifier
// ─────────────────────────────────────────────────────────────────────

/**
 * Logic patterns — wiring / behaviour / data-source fields.
 *
 * A key is "logic" if it:
 *   - ends with one of the suffixes below, OR
 *   - is an exact match in LOGIC_EXACT, OR
 *   - starts with one of the LOGIC_PREFIXES.
 */
const LOGIC_SUFFIXES = ["_href", "_kind", "_value", "_id", "_ids"] as const;
const LOGIC_EXACT = new Set([
    "mode",
    "source",
    "query",
    "list_id",
    "analytics_tag",
    "limit",
    "max_items",
    "redirect_path",
    "discount_code",
    "triggered_after_seconds",
    "allow_multiple",
    "countdown_to_iso",
    "target_iso",
    "threshold_iqd",
    "handle",
    "layout",
]);
const LOGIC_PREFIXES = ["manual_", "pinned_"] as const;

/**
 * Style patterns — presentation / appearance fields.
 *
 * A key is "style" if it:
 *   - is an exact match in STYLE_EXACT, OR
 *   - starts with one of the STYLE_PREFIXES, OR
 *   - ends with one of the STYLE_SUFFIXES.
 */
const STYLE_EXACT = new Set([
    "bg",
    "bg_tint",
    "background_tint",
    "tint",
    "align",
    "alignment",
    "columns",
    "density",
    "scale",
    "autoplay",
    "rotation",
    "speed",
    "image_position",
    "overlay_opacity",
    "scribble_color",
]);
const STYLE_PREFIXES = ["show_", "bg_", "background_"] as const;
const STYLE_SUFFIXES = ["_style", "_color", "_intensity", "_opacity"] as const;

function classifyKey(key: string): FieldGroup {
    // ── Logic ──────────────────────────────────────────────────────────
    for (const prefix of LOGIC_PREFIXES) {
        if (key.startsWith(prefix)) return "logic";
    }
    for (const suffix of LOGIC_SUFFIXES) {
        if (key.endsWith(suffix)) return "logic";
    }
    if (LOGIC_EXACT.has(key)) return "logic";

    // ── Style ──────────────────────────────────────────────────────────
    if (STYLE_EXACT.has(key)) return "style";
    for (const prefix of STYLE_PREFIXES) {
        if (key.startsWith(prefix)) return "style";
    }
    for (const suffix of STYLE_SUFFIXES) {
        if (key.endsWith(suffix)) return "style";
    }

    // ── Essential (default) ────────────────────────────────────────────
    // Catches: *_i18n, items, image_url, video_url, poster_url, logos,
    //          images, pills, tabs, messages_i18n, paragraphs_i18n,
    //          governorates_covered, baghdad_hours, provinces_hours, etc.
    return "essential";
}

// ─────────────────────────────────────────────────────────────────────
// Known section types — all 45 from packages/sections/src/*.tsx
// ─────────────────────────────────────────────────────────────────────

const KNOWN_SECTION_TYPES = new Set([
    "about_block",
    "accordion_richtext",
    "brand_story",
    "cart_line_items",
    "cart_summary",
    "category_grid",
    "checkout_form",
    "checkout_order_summary",
    "countdown_card",
    "cta_banner",
    "delivery_promise",
    "exit_intent_offer",
    "faq_accordion",
    "feature_grid",
    "founder_note",
    "free_gift_strip",
    "hero_image",
    "hero_marquee",
    "hero_split",
    "hero_video",
    "html_embed",
    "image_gallery",
    "instagram_grid",
    "logo_strip",
    "marquee_strip",
    "newsletter_inline",
    "numbers_stat_strip",
    "order_tracker",
    "pdp_add_to_cart",
    "pdp_buy_box",
    "pdp_gallery",
    "pdp_info_block",
    "pdp_info_tabs",
    "pdp_related_products",
    "pdp_variants",
    "policy_content",
    "press_quotes",
    "product_grid",
    "promo_banner",
    "search_results_grid",
    "sticky_cta_bar",
    "testimonials_carousel",
    "track_order_lookup",
    "trust_strip",
    "video_block",
]);

// ─────────────────────────────────────────────────────────────────────
// Public API (backward-compatible)
// ─────────────────────────────────────────────────────────────────────

/**
 * Returns true when the section type is a known Schneiders section,
 * which means the AutoForm should render grouped accordions.
 *
 * Unknown types (one-off test schemas, future externals) get flat render.
 */
export function hasFieldGroups(sectionType: string | undefined): boolean {
    if (!sectionType) return false;
    return KNOWN_SECTION_TYPES.has(sectionType);
}

/**
 * Resolve the group for a given field path.
 *
 * `sectionType` is accepted for backward compatibility but **ignored** —
 * classification is purely by field name convention.
 *
 * `fieldPath` may be dot-joined (e.g. `"title_i18n.en"`); only the
 * leading segment is classified because AutoForm groups at top-level only.
 */
export function getFieldGroup(
    sectionType: string | undefined,
    fieldPath: string,
): FieldGroup {
    const key = fieldPath.split(".")[0] ?? fieldPath;
    return classifyKey(key);
}

/* ─────────────────────────────────────────────────────────────────────
 * Simple ⇄ Advanced mode — field visibility
 * ─────────────────────────────────────────────────────────────────────
 * Simple mode shows essential + style fields and hides the logic group
 * (hrefs, ids, queries, analytics tags…). The convention-based grouping
 * occasionally misfiles a field a first-week merchant genuinely needs —
 * correct those here per section, never by rewriting the conventions.
 */

interface SimpleOverride {
    /** Field keys forced VISIBLE in Simple even though grouped as logic. */
    show?: readonly string[];
    /** Field keys forced HIDDEN in Simple even though essential/style. */
    hide?: readonly string[];
}

const SIMPLE_OVERRIDES: Record<string, SimpleOverride> = {
    // Raw markup is the one essential-bucket field a first-week merchant
    // should NOT meet — Advanced only (UX2-16).
    html_embed: { hide: ["html"] },
    // "Scribble color" is a designer whim, not a week-one decision — the
    // seeded default is fine; Advanced can still tune it (S3-08).
    product_grid: { hide: ["scribble_color"] },
};

/*
 * Merchant-essential wiring (UX2-01): these logic-bucket fields are the
 * CONTENT of their sections — a button's destination, a grid's products,
 * a countdown's date, a promo's code. Hiding them in Simple ships
 * half-controls (editable label, unreachable target), so they stay
 * visible in both modes. Kept as a name convention, mirroring classifyKey.
 */
const SIMPLE_SHOW_SUFFIXES = ["_href"] as const;
const SIMPLE_SHOW_EXACT = new Set([
    "secondary_cta_kind",
    "secondary_cta_value",
    "product_ids",
    "manual_skus",
    "countdown_to_iso",
    "target_iso",
    "category_id",
    "category_slug",
    "discount_code",
    "threshold_iqd",
    "wa_number",
    "whatsapp_number",
]);

function isSimpleWhitelisted(key: string): boolean {
    if (SIMPLE_SHOW_EXACT.has(key)) return true;
    return SIMPLE_SHOW_SUFFIXES.some((s) => key.endsWith(s));
}

/**
 * Should this field render in the given editor mode?
 * Advanced always sees everything. Unknown section types fall back to
 * "show everything" — never hide fields we can't classify.
 */
/**
 * Group for a field UNDER a given mode. In Simple, whitelisted wiring
 * fields are promoted into "essential" so they sit next to the content
 * they belong to (a collapsed "الإعدادات" accordion would bury them).
 */
export function getFieldGroupForMode(
    mode: "simple" | "advanced",
    sectionType: string | undefined,
    fieldPath: string,
): FieldGroup {
    const key = fieldPath.split(".")[0] ?? fieldPath;
    if (mode === "simple" && isSimpleWhitelisted(key)) return "essential";
    return classifyKey(key);
}

export function isFieldVisible(
    mode: "simple" | "advanced",
    sectionType: string | undefined,
    fieldPath: string,
): boolean {
    if (mode === "advanced") return true;
    const key = fieldPath.split(".")[0] ?? fieldPath;
    const override = sectionType ? SIMPLE_OVERRIDES[sectionType] : undefined;
    if (override?.show?.includes(key)) return true;
    if (override?.hide?.includes(key)) return false;
    if (isSimpleWhitelisted(key)) return true;
    return classifyKey(key) !== "logic";
}
