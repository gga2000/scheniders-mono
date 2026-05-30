// =====================================================================
// Page templates — barrel + apply helper
// =====================================================================
// 5 curated starter packs surfaced by the "+ Start from a template"
// button in the Builder v2 page tree. Each template is a list of
// `SectionInstance` objects with placeholder ids; `applyTemplate`
// rehashes those ids so reapplying always produces fresh sections.
// =====================================================================

import type { SectionInstance } from "@scheniders/shared";
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

/**
 * Rehash placeholder section ids into fresh uuids. Deep-clones the
 * template's sections so the canonical template object is never mutated.
 *
 * Re-applying the same template should always produce new ids — that's
 * required so dnd-kit / undo-redo / variant references stay consistent.
 */
export function applyTemplate(template: PageTemplate): SectionInstance[] {
    return template.sections.map((section) => ({
        ...section,
        id: cryptoRandomId(),
        base: deepCloneJson(section.base),
        variants: section.variants
            ? section.variants.map((v) => ({
                  ...v,
                  override: deepCloneJson(v.override),
              }))
            : undefined,
        visibility: section.visibility
            ? section.visibility.map((r) => ({ ...r }))
            : undefined,
    }));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Internals                                                            */
/* ─────────────────────────────────────────────────────────────────── */

function cryptoRandomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function deepCloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
