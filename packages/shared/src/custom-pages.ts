// =====================================================================
// Custom pages (E4)
// =====================================================================
// Pure helpers for merchant-authored custom pages: slug normalization,
// validation (incl. reserved-route collisions), and lookup. Shared
// between the editor (validation) and the storefront (serving).
// =====================================================================

import type { CustomPage } from "./types/store-config-v2";

export type { CustomPage };

/**
 * Path segments already owned by system routes under /s/<tenant>/* — a custom
 * page slug must not collide with these (or the system page would shadow it).
 */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
    "p",
    "products",
    "categories",
    "cart",
    "checkout",
    "search",
    "track",
    "about",
    "faq",
    "contact",
    "policies",
]);

/** Kebab-case a free-text title/slug into a safe URL slug. */
export function normalizeSlug(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/** A valid slug: lowercase alphanumerics in dash-separated segments. */
export function isValidSlug(slug: string): boolean {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export type SlugIssue = "empty" | "invalid" | "reserved" | "duplicate" | null;

/**
 * Validate a candidate slug for a custom page. `existing` is the current list
 * (for duplicate detection); `selfId` excludes the page being edited.
 */
export function validateSlug(
    slug: string,
    existing: CustomPage[] | undefined,
    selfId?: string,
): SlugIssue {
    const s = slug.trim();
    if (!s) return "empty";
    if (!isValidSlug(s)) return "invalid";
    if (RESERVED_PAGE_SLUGS.has(s)) return "reserved";
    const dup = (existing ?? []).some(
        (p) => p.id !== selfId && normalizeSlug(p.slug) === s,
    );
    return dup ? "duplicate" : null;
}

/**
 * Find a servable custom page by slug. Hidden pages return undefined (treated
 * as not found by the storefront).
 */
export function findCustomPage(
    pages: CustomPage[] | undefined,
    slug: string,
): CustomPage | undefined {
    if (!pages || pages.length === 0) return undefined;
    const s = normalizeSlug(slug);
    return pages.find((p) => normalizeSlug(p.slug) === s && !p.hidden);
}
