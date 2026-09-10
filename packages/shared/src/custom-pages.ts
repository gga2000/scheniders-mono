// =====================================================================
// Custom pages (E4)
// =====================================================================
// Pure helpers for merchant-authored custom pages: slug normalization,
// validation (incl. reserved-route collisions), and lookup. Shared
// between the editor (validation) and the storefront (serving).
// =====================================================================

import type {
    CustomPage,
    I18nString,
    PageId,
    PageMeta,
    SectionInstance,
    StoreConfigV2,
} from "./types/store-config-v2";

export type { CustomPage };

/**
 * Which page the builder canvas is currently authoring. The frozen `PageId`
 * enum can't name a custom page (those have a stable id), so the editor carries
 * a discriminated target instead of overloading `active_page`.
 */
export type EditTarget =
    | { kind: "system"; page_id: PageId }
    | { kind: "custom"; id: string };

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

/**
 * Find a custom page by stable id. Unlike `findCustomPage` (slug, serving) this
 * INCLUDES hidden pages — the editor authors hidden pages too.
 */
export function findCustomPageById(
    pages: CustomPage[] | undefined,
    id: string,
): CustomPage | undefined {
    return (pages ?? []).find((p) => p.id === id);
}

/** Index of a custom page by id (−1 if absent). Used to build patch paths. */
export function customPageIndexById(
    pages: CustomPage[] | undefined,
    id: string,
): number {
    return (pages ?? []).findIndex((p) => p.id === id);
}

/**
 * Read the section tree of the active edit target. Empty array when the target
 * is missing (e.g. a custom page that was deleted while selected).
 */
export function activePageSections(
    config: StoreConfigV2,
    target: EditTarget,
): SectionInstance[] {
    if (target.kind === "custom") {
        return findCustomPageById(config.custom_pages, target.id)?.sections ?? [];
    }
    return (
        config.pages.find((p) => p.page_id === target.page_id)?.sections ?? []
    );
}

/**
 * Return a copy of `config` with the active edit target's section tree replaced
 * by `mutate(prev)`. System pages are created on demand (matching the legacy
 * canvas behavior, which appended a page when the active one had no entry yet);
 * a custom target whose id no longer exists is a no-op (returns `config`).
 */
export function withActivePageSections(
    config: StoreConfigV2,
    target: EditTarget,
    mutate: (prev: SectionInstance[]) => SectionInstance[],
): StoreConfigV2 {
    if (target.kind === "custom") {
        const cps = config.custom_pages ?? [];
        const idx = cps.findIndex((p) => p.id === target.id);
        if (idx < 0) return config;
        const next = cps.slice();
        next[idx] = { ...next[idx], sections: mutate(next[idx].sections) };
        return { ...config, custom_pages: next };
    }
    const idx = config.pages.findIndex((p) => p.page_id === target.page_id);
    const nextPages = config.pages.slice();
    if (idx >= 0) {
        nextPages[idx] = {
            ...nextPages[idx],
            sections: mutate(nextPages[idx].sections),
        };
    } else {
        nextPages.push({ page_id: target.page_id, sections: mutate([]) });
    }
    return { ...config, pages: nextPages };
}

/**
 * Return a copy of `config` with the active edit target's SEO meta replaced.
 * System pages are created on demand; a missing custom id is a no-op.
 */
export function withActivePageMeta(
    config: StoreConfigV2,
    target: EditTarget,
    meta: PageMeta,
): StoreConfigV2 {
    if (target.kind === "custom") {
        const cps = config.custom_pages ?? [];
        const idx = cps.findIndex((p) => p.id === target.id);
        if (idx < 0) return config;
        const next = cps.slice();
        next[idx] = { ...next[idx], meta };
        return { ...config, custom_pages: next };
    }
    const idx = config.pages.findIndex((p) => p.page_id === target.page_id);
    const nextPages = config.pages.slice();
    if (idx >= 0) {
        nextPages[idx] = { ...nextPages[idx], meta };
    } else {
        nextPages.push({ page_id: target.page_id, sections: [], meta });
    }
    return { ...config, pages: nextPages };
}

/* ───────────────────────────── Articles ───────────────────────────── */

/**
 * One article, reduced to what a listing needs.
 *
 * Deliberately not the `CustomPage` itself. Sections receive a pruned tenant
 * so a page's section tree is never serialised into the RSC payload of some
 * other page that merely links to it — an index of twenty guides would
 * otherwise ship twenty whole pages to the browser to render twenty cards.
 */
export interface ArticleSummary {
    /** Custom page id — stable across slug edits. */
    id: string;
    /** URL slug; the article lives at `/p/<slug>`. */
    slug: string;
    title?: I18nString;
    excerpt?: I18nString;
    cover_url?: string;
    author?: string;
    /** ISO date, or undefined when the merchant set none. */
    published_at?: string;
}

/** A custom page the merchant marked as an article. */
export function isArticle(page: CustomPage): boolean {
    return page.article !== undefined && page.article !== null;
}

/**
 * Published articles, newest first.
 *
 * Three rules, each of them a thing that would otherwise leak:
 *   * A hidden page is not served, so it must not be listed either — a card
 *     linking to a 404 is worse than no card.
 *   * A `published_at` in the future is a scheduled article: it keeps its URL
 *     (so the merchant can preview and share it) but stays out of lists.
 *   * An article with no date sorts last rather than being dropped. A merchant
 *     who wrote a guide and forgot the date should still see it on their store.
 */
export function listArticleSummaries(
    pages: readonly CustomPage[] | undefined | null,
    opts?: { now?: Date; limit?: number },
): ArticleSummary[] {
    const now = (opts?.now ?? new Date()).getTime();

    const out = (pages ?? [])
        .filter((p) => isArticle(p) && p.hidden !== true)
        .filter((p) => {
            const at = p.article?.published_at;
            if (!at) return true;
            const t = Date.parse(at);
            return Number.isNaN(t) ? true : t <= now;
        })
        .map<ArticleSummary>((p) => ({
            id: p.id,
            slug: p.slug,
            ...(p.title ? { title: p.title } : {}),
            ...(p.article?.excerpt ? { excerpt: p.article.excerpt } : {}),
            ...(p.article?.cover_url
                ? { cover_url: p.article.cover_url }
                : p.meta?.og_image_url
                  ? { cover_url: p.meta.og_image_url }
                  : {}),
            ...(p.article?.author ? { author: p.article.author } : {}),
            ...(p.article?.published_at
                ? { published_at: p.article.published_at }
                : {}),
        }));

    out.sort((a, b) => {
        const ta = a.published_at ? Date.parse(a.published_at) : Number.NaN;
        const tb = b.published_at ? Date.parse(b.published_at) : Number.NaN;
        const va = Number.isNaN(ta) ? -Infinity : ta;
        const vb = Number.isNaN(tb) ? -Infinity : tb;
        return vb - va;
    });

    return typeof opts?.limit === "number" ? out.slice(0, opts.limit) : out;
}
