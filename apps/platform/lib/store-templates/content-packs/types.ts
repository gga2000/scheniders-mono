// =====================================================================
// Content packs — what a store SAYS, apart from how it LOOKS
// =====================================================================
// A visual direction (StoreTemplate) owns the brand kit and the section
// stacks. A content pack owns the words and the taxonomy for a niche: the
// hero line, the story, the promises, the FAQ, the policies, the starter
// categories and the product attributes shoppers filter by. Onboarding
// composes one of each: pick what you sell → pick how it looks.
//
// Everything here is semantic, not section-shaped. `applyContentPack` maps
// each field onto whichever section types the chosen direction placed, so
// a pack written once reads correctly on every direction — and the
// signature direction builds its stacks straight from the same fields.
//
// Honesty rule: a pack carries no invented customer reviews, press quotes
// or statistics. Those sections render nothing until the merchant has real
// ones. A registry pack also names no store: Scheniders' own words live in
// ../scheniders-words.ts and reach only Scheniders' store.
// =====================================================================

import type { I18nString } from "@scheniders/shared";

export interface PackFaqItem {
    q_i18n: I18nString;
    a_i18n: I18nString;
}

export interface PackPillar {
    title_i18n: I18nString;
    body_i18n: I18nString;
}

export interface PackPolicy {
    heading_i18n: I18nString;
    body_md_i18n: I18nString;
    last_updated?: string;
}

export interface PackCollection {
    /** Category slug the tile links to (`/categories/<slug>`); also seeded. */
    slug: string;
    title_i18n: I18nString;
    sub_i18n: I18nString;
    cta_label_i18n: I18nString;
}

export interface PackCategory {
    slug: string;
    name_i18n: I18nString;
}

/** Seed taxonomy in the write shape product_attribute_defs accepts. */
export interface PackAttribute {
    key: string;
    name_i18n: I18nString;
    kind: "enum" | "range" | "group_list" | "text" | "boolean";
    options?: { value: string; label_i18n: I18nString }[];
    group_keys?: { key: string; label_i18n: I18nString }[];
    range_min?: number;
    range_max?: number;
    unit_i18n?: I18nString;
    is_filterable?: boolean;
    is_comparable?: boolean;
    display_order?: number;
}

export interface PackTestimonial {
    name_i18n: I18nString;
    quote_i18n: I18nString;
}

export interface PackContactCard {
    title_i18n: I18nString;
    sub_i18n: I18nString;
    cta_label_i18n: I18nString;
}

/** Contact-card copy beside the FAQ (home) and on deeper pages (more). */
export interface PackContact {
    home: PackContactCard;
    more: PackContactCard;
}

export interface PackHeadingPair {
    eyebrow_i18n: I18nString;
    title_i18n: I18nString;
}

/** Section eyebrow/heading pairs the signature direction shows. */
export interface PackHeadings {
    spotlights: PackHeadingPair;
    collections: PackHeadingPair;
    testimonials: PackHeadingPair;
    pillars: PackHeadingPair;
    pillars_about: PackHeadingPair;
    faq: PackHeadingPair & { sub_i18n: I18nString; sub_more_i18n: I18nString };
    contact_page: PackHeadingPair & { sub_i18n: I18nString };
    catalog_i18n: I18nString;
    see_all_i18n: I18nString;
    see_more_i18n: I18nString;
    reviews_gallery_i18n: I18nString;
}

export interface ContentPack {
    /** Stable id: "perfume", "coffee", … Persisted on config.template.pack_id. */
    id: string;
    name_i18n: I18nString;
    description_i18n: I18nString;
    /** Industry names/slugs this pack answers to (wizard rows are uuids with a name). */
    match: RegExp[];

    hero: { headline_i18n: I18nString; sub_i18n: I18nString; cta_label_i18n: I18nString };
    /** The long-form story (brand_story paragraphs / about hero). */
    story: { title_i18n: I18nString; body_i18n: I18nString };
    /** The short version (about_block / about_spotlight). */
    about: { title_i18n: I18nString; body_i18n: I18nString };
    founder: { quote_i18n: I18nString; role_i18n: I18nString };
    /** Exactly three promises (pillars_grid / feature_grid). */
    pillars: [PackPillar, PackPillar, PackPillar];
    /** Four short trust labels (trust_strip / trust_badge_row / marquee). */
    trust: [I18nString, I18nString, I18nString, I18nString];
    faq: PackFaqItem[];
    /** Order-lifecycle questions (about page). */
    faq_orders: PackFaqItem[];
    delivery: { sla_i18n: I18nString; inspection_i18n: I18nString; reassurance_i18n: I18nString };
    /** Product-page policy accordion. */
    pdp_policies: { title_i18n: I18nString; body_i18n: I18nString }[];
    pdp: { urgency_i18n: I18nString; feature_title_i18n: I18nString };
    bestsellers: { eyebrow_i18n: I18nString; heading_i18n: I18nString; sub_i18n: I18nString };
    /** Two spotlight tiles + three collection tiles; all seeded as categories. */
    spotlights: [PackCategory, PackCategory];
    collections: [PackCollection, PackCollection, PackCollection];
    /** Legal pages. Absent → the platform's generic boilerplate stays. */
    policies?: { shipping: PackPolicy; returns: PackPolicy; privacy: PackPolicy; terms: PackPolicy };
    /** Real customer words only — see the honesty rule above. */
    testimonials: PackTestimonial[];
    categories: PackCategory[];
    attributes: PackAttribute[];

    /* ── Optional refinements a direction may use when present ────── */
    /** Footer tagline. */
    tagline_i18n?: I18nString;
    /** A second pillar set for the about page; falls back to `pillars`. */
    pillars_about?: [PackPillar, PackPillar, PackPillar];
    /** Pre-footer trust labels; falls back to `trust`. */
    trust_bottom?: [I18nString, I18nString, I18nString, I18nString];
    /** Product-page "more products" grid copy; falls back to `bestsellers`. */
    bestsellers_pdp?: { eyebrow_i18n: I18nString; heading_i18n: I18nString; sub_i18n: I18nString };
    /** Contact-card copy beside the FAQ (home) and on deeper pages (more). */
    contact?: PackContact;
    /**
     * Section eyebrow/heading pairs the signature direction shows. Absent →
     * NEUTRAL_HEADINGS (./headings), never another pack's or store's.
     */
    headings?: PackHeadings;
}
