// =====================================================================
// Store template types
// =====================================================================
// A `StoreTemplate` is a full visual direction for a store: a brand-kit
// preset plus section stacks for every page that carries the brand.
//
// It is deliberately NOT the same thing as a `PageTemplate`:
//   - StoreTemplate  → chosen once, at onboarding. Sets the whole look.
//   - PageTemplate   → applied repeatedly, per page, inside the editor.
// =====================================================================

import type {
    BrandKit,
    I18nString,
    PageId,
    SectionInstance,
} from "@scheniders/shared";
import { getManifestEntry } from "@/lib/sections-manifest";

/**
 * Brand kit minus `identity` — the merchant's name, logo and favicon come
 * from the wizard, never from a template.
 */
export type BrandKitPreset = Omit<BrandKit, "identity">;

export interface StoreTemplate {
    /** Stable id (e.g. "kinetic_ink"). Persisted on the industries table. */
    id: string;
    /**
     * Bumped whenever the direction's section stacks change shape — a section
     * added, removed or moved. A store stamped with an older version is told
     * an update exists; the upgrade planner then compares its actual sections
     * against this definition, so the number is a signal, not a migration key.
     */
    version: number;
    /** Localized name shown in the wizard picker. */
    name_i18n: I18nString;
    /** Localized one-liner description. */
    description_i18n: I18nString;
    /** Visual direction preset written to `config.brand_kit`. */
    brand_kit: BrandKitPreset;
    /**
     * Section stacks per page, in display order. Section ids are
     * placeholders (`__template-1__`); `applyStoreTemplate` rehashes them
     * so re-applying always mints fresh ids.
     */
    pages: Partial<Record<PageId, SectionInstance[]>>;
    /**
     * Global sections. `header`/`footer` are always seeded; `promo_bar`
     * lets a direction ship a branded top bar instead of the storefront's
     * default `announcement_bar` fallback.
     */
    globals: {
        header: SectionInstance;
        footer: SectionInstance;
        promo_bar?: SectionInstance;
    };
}

/**
 * Placeholder section id for a template definition. Namespaced per
 * template so two stacks in the same file can't collide before rehashing.
 */
export function tplId(template: string, n: number): string {
    return `__${template}-${n}__`;
}

/**
 * A section's `defaultProps` from the manifest, deep-cloned so a template
 * can spread and override without mutating the registry.
 *
 * Throws on an unknown type: a template referencing a section that no
 * longer exists must fail loudly at module load, not seed a broken store.
 */
export function defaults(type: string): Record<string, unknown> {
    const entry = getManifestEntry(type);
    if (!entry) throw new Error(`Missing manifest entry: ${type}`);
    return JSON.parse(JSON.stringify(entry.defaultProps)) as Record<
        string,
        unknown
    >;
}

/** Build an enabled `SectionInstance` from manifest defaults + overrides. */
export function section(
    template: string,
    n: number,
    type: string,
    overrides?: Record<string, unknown>,
): SectionInstance {
    return {
        id: tplId(template, n),
        type,
        enabled: true,
        base: { ...defaults(type), ...(overrides ?? {}) },
    };
}
