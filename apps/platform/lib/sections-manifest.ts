// =====================================================================
// Sections manifest (Schneiders Builder v2)
// =====================================================================
// Auto-generated projection of `@scheniders/sections` BUILTIN_SECTIONS.
//
// DO NOT hand-edit entries or duplicate Zod schemas here.
// The single source of truth is each section definition in
// `packages/sections/src/<type>.tsx`. To add or change a section,
// edit that file; this module derives everything from it at runtime.
//
// Each entry captures EVERYTHING the editor needs to:
//   - list sections in the "Add section" picker (name, description,
//     thumbnail, category)
//   - decide whether a section is placeable on the current page
//     (`valid_on`)
//   - seed a fresh `SectionInstance.base` when the merchant adds one
//     (`defaultProps`, taken directly from the def)
//   - render an auto-generated edit form for the section's props
//     (`schema`, the real Zod schema from the def — zero drift)
// =====================================================================

import type { LocaleCode, PageId } from "@scheniders/shared";
import { BUILTIN_SECTIONS, type AnySectionDefinition } from "@scheniders/sections";
import { STRINGS, t } from "@/lib/editor-i18n";

// ─── Types ────────────────────────────────────────────────────────────

export type SectionCategory =
    | "hero"
    | "products"
    | "trust"
    | "story"
    | "content"
    | "conversion"
    | "page";

/**
 * Editor-visible section metadata — identical to `AnySectionDefinition`
 * but with the `render` component stripped (the platform bundle doesn't
 * need it and it drags in the full React storefront render tree).
 */
export type SectionManifestEntry = Omit<AnySectionDefinition, "render">;

// ─── Manifest (derived from registry) ─────────────────────────────────

function toManifestEntry(def: AnySectionDefinition): SectionManifestEntry {
    // Destructure to explicitly drop `render`; keep every other field.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { render: _render, ...rest } = def;
    return rest as SectionManifestEntry;
}

/**
 * All built-in section types, in registration order.
 * Derived from `BUILTIN_SECTIONS` — always in sync with the registry.
 *
 * Cast to `AnySectionDefinition[]` so we can `.map()` over the
 * heterogeneous tuple that TypeScript infers for BUILTIN_SECTIONS.
 */
export const SECTIONS_MANIFEST: SectionManifestEntry[] =
    (BUILTIN_SECTIONS as AnySectionDefinition[]).map(toManifestEntry);

// ─── Helpers ──────────────────────────────────────────────────────────

export function getManifestEntry(type: string): SectionManifestEntry | undefined {
    return SECTIONS_MANIFEST.find((s) => s.type === type);
}

export function listManifestForPage(page: PageId): SectionManifestEntry[] {
    return SECTIONS_MANIFEST.filter((s) => s.valid_on.includes(page));
}

/** All distinct categories, in canonical display order. */
export const SECTION_CATEGORIES: SectionCategory[] = [
    "hero",
    "trust",
    "products",
    "story",
    "content",
    "conversion",
    "page",
];

/** Friendly EN label per category — used as filter chip text. */
export const SECTION_CATEGORY_LABELS: Record<SectionCategory, string> = {
    hero: "Hero",
    trust: "Trust",
    products: "Products",
    story: "Story",
    content: "Content",
    conversion: "Conversion",
    page: "Page",
};

// ─── Locale-aware display helpers ─────────────────────────────────────
// Section defs carry `{ en, ar? }` names/descriptions; the editor chrome
// must resolve them by the active editor locale instead of hardcoding
// `.en` (Arabic-first market). Kurdish falls back to English until the
// section catalog grows `ku` strings.

export function sectionDisplayName(
    entry: Pick<SectionManifestEntry, "name" | "type">,
    locale: LocaleCode,
): string {
    const name = entry.name as { en: string; ar?: string; ku?: string };
    return name[locale] ?? name.en ?? entry.type;
}

export function sectionDisplayDescription(
    entry: Pick<SectionManifestEntry, "description">,
    locale: LocaleCode,
): string {
    const desc = entry.description as { en: string; ar?: string; ku?: string };
    return desc[locale] ?? desc.en ?? "";
}

/** Localized category label (picker chips, row sublabels). */
export function sectionCategoryLabel(
    category: SectionCategory,
    locale: LocaleCode,
): string {
    return t(STRINGS.section_category[category], locale);
}
