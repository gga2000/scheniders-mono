// =====================================================================
// Section field visibility — hide fields a sibling setting makes inert
// =====================================================================
// Some sections read one set of fields OR another, chosen by a sibling
// switch. Showing both lets a merchant edit a list that has no effect on
// the page. Rules here are keyed by field name + the sibling they depend
// on (the same convention-by-name approach as section-field-widgets.ts),
// so no section schema changes.
// =====================================================================

type Rule = (siblings: Record<string, unknown>) => boolean;

/**
 * `source: "config" | "categories"` (category_spotlight_pair): the cards
 * come from hand-written `items`, or from real categories picked by slug.
 */
const fromCategories = (s: Record<string, unknown>): boolean => s.source === "categories";

const RULES: Record<string, Rule> = {
    items: (s) => !("source" in s) || !fromCategories(s),
    category_slugs: (s) => fromCategories(s),
    show_counts: (s) => fromCategories(s),
};

/** Whether `fieldKey` affects the page given its sibling values. */
export function isFieldRelevant(
    fieldKey: string,
    siblings: Record<string, unknown>,
    shapeKeys: readonly string[],
): boolean {
    // Rules only apply to objects that actually have the switch.
    if (!shapeKeys.includes("source")) return true;
    const rule = RULES[fieldKey];
    return rule ? rule(siblings) : true;
}
