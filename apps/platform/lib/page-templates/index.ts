// =====================================================================
// Page templates — barrel + apply helper
// =====================================================================
// 5 curated starter packs surfaced by the "+ Start from a template"
// button in the Builder v2 page tree. Each template is a list of
// `SectionInstance` objects with placeholder ids; `applyTemplate`
// rehashes those ids so reapplying always produces fresh sections.
// =====================================================================

import type { PageId, SectionInstance } from "@scheniders/shared";
import { getManifestEntry } from "@/lib/sections-manifest";
import { rehashSections } from "@/lib/section-ids";
import { salePageTemplate } from "./sale-page";
import { productLaunchTemplate } from "./product-launch";
import { brandStoryTemplate } from "./brand-story";
import { iraqiMarketLandingTemplate } from "./iraqi-market-landing";
import { minimalCatalogTemplate } from "./minimal-catalog";
import type { PageTemplate } from "./types";

export type { PageTemplate } from "./types";

export const PAGE_TEMPLATES: PageTemplate[] = [
    salePageTemplate,
    productLaunchTemplate,
    brandStoryTemplate,
    iraqiMarketLandingTemplate,
    minimalCatalogTemplate,
];

export function getPageTemplate(id: string): PageTemplate | undefined {
    return PAGE_TEMPLATES.find((t) => t.id === id);
}

/** Can this section type legally live on the given page? */
function sectionValidOnPage(type: string, pageId: PageId): boolean {
    const entry = getManifestEntry(type);
    if (!entry) return true; // unknown types: don't silently drop
    return entry.valid_on.includes(pageId);
}

/**
 * BUG29 guard: templates whose sections ALL fit the target page. The
 * curated packs are home-flavored, so non-home pages usually get an
 * empty list — the UI hides the template entry point instead of
 * injecting hero_image onto a checkout page.
 */
export function templatesForPage(pageId: PageId): PageTemplate[] {
    return PAGE_TEMPLATES.filter((t) =>
        t.sections.every((s) => sectionValidOnPage(s.type, pageId)),
    );
}

/**
 * Rehash placeholder section ids into fresh uuids. Deep-clones the
 * template's sections so the canonical template object is never mutated.
 *
 * Re-applying the same template should always produce new ids — that's
 * required so dnd-kit / undo-redo / variant references stay consistent.
 */
export function applyTemplate(
    template: PageTemplate,
    /**
     * Target page. When given, sections invalid on that page are
     * dropped (BUG29 defense-in-depth — pickers already filter whole
     * templates).
     */
    targetPageId?: PageId,
): SectionInstance[] {
    const sections = targetPageId
        ? template.sections.filter((s) => sectionValidOnPage(s.type, targetPageId))
        : template.sections;
    return rehashSections(sections);
}
