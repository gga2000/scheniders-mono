// =====================================================================
// Page template types
// =====================================================================
// A `PageTemplate` is a reusable starter pack — an ordered list of
// `SectionInstance` objects targeted at a specific page (usually home).
// Section ids inside the template use placeholder strings (e.g.
// `__template-1__`); when the template is applied to a page they're
// rehashed to fresh uuids so reapplying always produces new ids.
// =====================================================================

import type { I18nString, PageId, SectionInstance } from "@scheniders/shared";

export interface PageTemplate {
    /** Stable id (e.g. "sale_page"). */
    id: string;
    /** Localized human name shown in the picker. */
    name_i18n: I18nString;
    /** Localized one-liner description. */
    description_i18n: I18nString;
    /** Page this template is intended for. */
    page_id: PageId;
    /**
     * Sections in display order. Each instance's `id` is a placeholder
     * like `__template-1__`; applyTemplate rewrites them to fresh ids.
     */
    sections: SectionInstance[];
}

/** Generate a placeholder section id for a template definition. */
export function tplId(n: number): string {
    return `__template-${n}__`;
}
