// =====================================================================
// Store templates — barrel + apply helper
// =====================================================================
// Five full visual directions offered in the onboarding wizard. Picking
// one sets the store's `brand_kit` AND seeds every page that carries the
// brand, so two merchants who pick different templates end up with stores
// that do not look like the same platform.
//
// Not to be confused with `lib/page-templates` — those are single-page
// starter packs applied from inside the editor.
// =====================================================================

import type { PageId, SectionInstance, StoreConfigV2 } from "@scheniders/shared";
import { getManifestEntry } from "@/lib/sections-manifest";
import { rehashSections } from "@/lib/section-ids";
import { kineticInkTemplate } from "./kinetic-ink";
import { auroraGlassTemplate } from "./aurora-glass";
import { cobaltBroadsheetTemplate } from "./cobalt-broadsheet";
import { chromeNightTemplate } from "./chrome-night";
import { sunbleachTemplate } from "./sunbleach";
import { schenidersSignatureTemplate } from "./scheniders-signature";
import type { StoreTemplate } from "./types";

export type { StoreTemplate, BrandKitPreset } from "./types";

export const STORE_TEMPLATES: StoreTemplate[] = [
    kineticInkTemplate,
    auroraGlassTemplate,
    cobaltBroadsheetTemplate,
    chromeNightTemplate,
    sunbleachTemplate,
    schenidersSignatureTemplate,
];

/**
 * Ids of the previous home-only page templates, mapped to the store
 * template that replaced them. `industries.recommended_template_id` rows
 * carry the old ids until the migration lands, and restored snapshots or
 * local databases may carry them indefinitely — resolving through this
 * map means a stale row degrades to a sensible template instead of
 * seeding an empty store.
 */
export const LEGACY_TEMPLATE_ALIAS: Record<string, string> = {
    sale_page: "sunbleach",
    product_launch: "aurora_glass",
    brand_story: "cobalt_broadsheet",
    iraqi_market_landing: "kinetic_ink",
    minimal_catalog: "chrome_night",
};

/** Resolve a template id, following the legacy alias map. */
export function getStoreTemplate(id: string): StoreTemplate | undefined {
    const direct = STORE_TEMPLATES.find((t) => t.id === id);
    if (direct) return direct;
    const aliased = LEGACY_TEMPLATE_ALIAS[id];
    return aliased ? STORE_TEMPLATES.find((t) => t.id === aliased) : undefined;
}

/** Can this section type legally live on the given page? */
function sectionValidOnPage(type: string, pageId: PageId): boolean {
    const entry = getManifestEntry(type);
    if (!entry) return true; // unknown types: don't silently drop
    return entry.valid_on.includes(pageId);
}

/**
 * Write a template into a config: brand kit, globals and every page
 * stack, with fresh section ids.
 *
 * Mutates `cfg` in place and returns it — the caller owns a config it
 * just built from `emptyStoreConfigV2()`, so there is nothing to protect
 * against here and cloning the whole config twice would be wasteful.
 *
 * `identity` is untouched: the merchant's name, logo and favicon come
 * from the wizard, never from a template.
 */
export function applyStoreTemplate(
    cfg: StoreConfigV2,
    template: StoreTemplate,
): StoreConfigV2 {
    cfg.brand_kit = {
        ...JSON.parse(JSON.stringify(template.brand_kit)),
        identity: cfg.brand_kit.identity,
    };

    cfg.globals = {
        ...cfg.globals,
        header: rehashSections([template.globals.header])[0],
        footer: rehashSections([template.globals.footer])[0],
        ...(template.globals.promo_bar
            ? { promo_bar: rehashSections([template.globals.promo_bar])[0] }
            : {}),
    };

    for (const page of cfg.pages) {
        const stack = template.pages[page.page_id];
        if (!stack) continue;
        // Defense in depth: a section whose `valid_on` no longer covers
        // this page is dropped rather than rendered into a broken page.
        const valid = stack.filter((s) => sectionValidOnPage(s.type, page.page_id));
        page.sections = rehashSections(valid);
    }

    return cfg;
}

/** Sections a template puts on a page, with fresh ids. Used by previews. */
export function storeTemplateSections(
    template: StoreTemplate,
    pageId: PageId,
): SectionInstance[] {
    return rehashSections(template.pages[pageId] ?? []);
}
