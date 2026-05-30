// =====================================================================
// Section field groups — Schneiders Builder v2
// =====================================================================
// Lightweight metadata registry that classifies each section schema's
// top-level fields into one of three editor groups:
//
//   - "essential"  → the 1-3 fields the merchant changes 90% of the
//                    time. Rendered open by default in AutoForm.
//   - "style"      → visual tweaks (alignment, tints, overlays).
//   - "logic"      → wiring (CTA hrefs, CTA kinds, analytics tags).
//
// We keep this in a single sidecar file (instead of stuffing it into
// every section schema via `.describe()`) because:
//   1. Adding a tag mechanism to Zod metadata is fragile across
//      `.optional()` / `.default()` wrappers — strings can vanish.
//   2. The editor is the only consumer; the storefront doesn't care
//      what group a field is in.
//   3. It's trivial to read here, and merchants only ever see groups
//      for the section types we cover. Unclassified fields fall back
//      to "style" so we degrade gracefully.
//
// Field paths are dot-joined top-level keys (e.g. `secondary_cta_kind`).
// Nested fields inherit their parent's group implicitly through the
// AutoForm renderer (which currently groups by top-level only).
// =====================================================================

export type FieldGroup = "essential" | "style" | "logic";

export const FIELD_GROUPS_ORDER: FieldGroup[] = [
    "essential",
    "style",
    "logic",
];

/**
 * Canonical mapping of section-type → field-name → group.
 *
 * Covers the 12 highest-traffic sections in the Builder v2 library.
 * Any section type not in this map renders flat (no groups) — see
 * `hasFieldGroups()`. Any field name not in a section's map defaults
 * to `"style"` — see `getFieldGroup()`.
 */
export const FIELD_GROUPS: Record<string, Record<string, FieldGroup>> = {
    hero_image: {
        title_i18n: "essential",
        subtitle_i18n: "essential",
        image_url: "essential",
        cta_label_i18n: "essential",
        cta_href: "logic",
        eyebrow_i18n: "style",
        secondary_cta_kind: "logic",
        secondary_cta_value: "logic",
        secondary_cta_label_i18n: "logic",
    },
    trust_strip: {
        items: "essential",
        title_i18n: "essential",
        background_tint: "style",
        alignment: "style",
        density: "style",
    },
    product_grid: {
        title_i18n: "essential",
        source: "essential",
        product_ids: "essential",
        category_id: "essential",
        columns: "style",
        max_items: "style",
        show_prices: "style",
        background_tint: "style",
        cta_label_i18n: "logic",
        cta_href: "logic",
        analytics_tag: "logic",
    },
    category_grid: {
        title_i18n: "essential",
        items: "essential",
        columns: "style",
        background_tint: "style",
        alignment: "style",
        link_target: "logic",
        analytics_tag: "logic",
    },
    delivery_promise: {
        title_i18n: "essential",
        items: "essential",
        background_tint: "style",
        alignment: "style",
        density: "style",
        analytics_tag: "logic",
    },
    testimonials_carousel: {
        title_i18n: "essential",
        items: "essential",
        background_tint: "style",
        autoplay: "style",
        show_avatars: "style",
        alignment: "style",
        analytics_tag: "logic",
    },
    faq_accordion: {
        title_i18n: "essential",
        items: "essential",
        background_tint: "style",
        alignment: "style",
        default_open_index: "style",
        analytics_tag: "logic",
    },
    newsletter_inline: {
        title_i18n: "essential",
        subtitle_i18n: "essential",
        cta_label_i18n: "essential",
        background_tint: "style",
        alignment: "style",
        placeholder_i18n: "style",
        success_message_i18n: "style",
        list_id: "logic",
        analytics_tag: "logic",
    },
    cta_banner: {
        title_i18n: "essential",
        subtitle_i18n: "essential",
        cta_label_i18n: "essential",
        cta_href: "logic",
        background_tint: "style",
        alignment: "style",
        eyebrow_i18n: "style",
        image_url: "style",
        secondary_cta_kind: "logic",
        secondary_cta_value: "logic",
        secondary_cta_label_i18n: "logic",
        analytics_tag: "logic",
    },
    pdp_buy_box: {
        show_price: "essential",
        show_stock: "essential",
        cta_label_i18n: "essential",
        background_tint: "style",
        alignment: "style",
        show_quantity_picker: "style",
        show_variant_picker: "style",
        cta_kind: "logic",
        whatsapp_number: "logic",
        analytics_tag: "logic",
    },
    pdp_info_tabs: {
        tabs: "essential",
        default_tab_index: "style",
        background_tint: "style",
        alignment: "style",
        analytics_tag: "logic",
    },
    feature_grid: {
        title_i18n: "essential",
        items: "essential",
        columns: "style",
        background_tint: "style",
        alignment: "style",
        icon_style: "style",
        analytics_tag: "logic",
    },
};

/** True when the section type has any group metadata registered. */
export function hasFieldGroups(sectionType: string | undefined): boolean {
    if (!sectionType) return false;
    return Boolean(FIELD_GROUPS[sectionType]);
}

/**
 * Resolve the group for a given (sectionType, fieldPath).
 *
 * Falls back to `"style"` when:
 *   - sectionType is not registered, OR
 *   - the field name is not in the section's map.
 *
 * `fieldPath` is the dot-joined path; we currently only classify the
 * leading segment because the AutoForm groups at top-level only.
 */
export function getFieldGroup(
    sectionType: string | undefined,
    fieldPath: string,
): FieldGroup {
    if (!sectionType) return "style";
    const entry = FIELD_GROUPS[sectionType];
    if (!entry) return "style";
    const top = fieldPath.split(".")[0] ?? fieldPath;
    return entry[top] ?? "style";
}
