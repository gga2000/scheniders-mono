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
