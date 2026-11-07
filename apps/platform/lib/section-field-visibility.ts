// =====================================================================
// Section field visibility — hide fields a sibling setting makes inert
// =====================================================================
// Some sections read one set of fields OR another, chosen by a sibling
// switch. Showing both lets a merchant edit a list that has no effect on
// the page. Rules here are keyed by field name + the sibling they depend
// on (the same convention-by-name approach as section-field-widgets.ts),
// so no section schema changes. Each rule set applies only to objects
// whose schema has its switch field.
// =====================================================================

type Rule = (siblings: Record<string, unknown>) => boolean;

interface RuleSet {
    /** The switch field; the set applies only when the schema has it. */
    switchKey: string;
    rules: Record<string, Rule>;
}

/**
 * `source: "config" | "categories"` (category_spotlight_pair): the cards
 * come from hand-written `items`, or from real categories picked by slug.
 */
const fromCategories = (s: Record<string, unknown>): boolean => s.source === "categories";

/**
 * `product_faq` (faq_contact_split): when set, the product's own questions
 * replace `items` and every other layout. `contact_style` only styles that
 * product FAQ; `heading_style` only affects it and the compact layout.
 */
const hasProductFaq = (s: Record<string, unknown>): boolean =>
    s.product_faq !== undefined && s.product_faq !== null;

const hasText = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

const RULE_SETS: readonly RuleSet[] = [
    {
        switchKey: "source",
        rules: {
            items: (s) => !fromCategories(s),
            category_slugs: (s) => fromCategories(s),
            show_counts: (s) => fromCategories(s),
        },
    },
    {
        // about_spotlight: "split" puts the photo beside the words, so there
        // is no shade over it.
        switchKey: "layout",
        rules: {
            overlay_opacity: (s) => s.layout !== "split",
        },
    },
    {
        // product_grid: search and page size belong to the full-catalogue
        // bar; without it the grid has neither.
        switchKey: "catalog_controls",
        rules: {
            catalog_search: (s) => s.catalog_controls === true,
            catalog_page_size: (s) => s.catalog_controls === true,
        },
    },
    {
        switchKey: "show_category_links",
        rules: {
            category_links_limit: (s) => s.show_category_links === true,
        },
    },
    {
        // hero_card_float: the photo's shape and crop only exist when there
        // is a photo; without one the hero is a plain colour block.
        switchKey: "bg_image_url",
        rules: {
            media_ratio: (s) => hasText(s.bg_image_url),
            focal_x: (s) => hasText(s.bg_image_url),
            focal_y: (s) => hasText(s.bg_image_url),
        },
    },
    {
        switchKey: "product_faq",
        rules: {
            items: (s) => !hasProductFaq(s),
            contact_style: (s) => hasProductFaq(s),
            heading_style: (s) => hasProductFaq(s) || s.compact === true,
        },
    },
];

/** Whether `fieldKey` affects the page given its sibling values. */
export function isFieldRelevant(
    fieldKey: string,
    siblings: Record<string, unknown>,
    shapeKeys: readonly string[],
): boolean {
    for (const set of RULE_SETS) {
        if (!shapeKeys.includes(set.switchKey)) continue;
        const rule = set.rules[fieldKey];
        if (rule && !rule(siblings)) return false;
    }
    return true;
}
