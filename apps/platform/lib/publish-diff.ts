// =====================================================================
// publish-diff — shape the publish-confirm-sheet renders
// =====================================================================
// Given a previously-published config (or null on first publish) and the
// current draft, produce a merchant-facing diff:
//   • brand kit flagged at the top
//   • globals flagged with which slot(s) changed
//   • per-page added / removed / modified sections
// Field deltas inside a modified section are limited to top-level scalars
// plus `_i18n` per-locale strings — deeper recursion is intentionally
// summarised as "changed" to keep the sheet readable.
// =====================================================================

import type {
    BrandKit,
    GlobalSections,
    I18nString,
    LocaleCode,
    PageConfig,
    PageId,
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";

/* ─────────────────────────────────────────────────────────────────── */
/* Types                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export type FieldDeltaKind = "scalar" | "i18n" | "complex";

export interface FieldDelta {
    /** Top-level key on the section's `base`. */
    field: string;
    kind: FieldDeltaKind;
    /** For `i18n`, the locale that actually changed (one entry per locale). */
    locale?: LocaleCode;
    before?: unknown;
    after?: unknown;
}

export type SectionChangeKind = "added" | "removed" | "modified";

export interface SectionChange {
    kind: SectionChangeKind;
    section_id: string;
    section_type: string;
    /** Best-effort human label (from `instance.label` or section type). */
    label: string;
    /** Only populated for `modified`. */
    deltas?: FieldDelta[];
}

export interface PageDiff {
    page_id: PageId;
    changes: SectionChange[];
}

export interface PublishDiff {
    /** True on first publish — caller is expected to surface special copy. */
    isFirstPublish: boolean;
    brandKitChanged: boolean;
    /** Slots that differ between prev / next globals. */
    globalsChanged: Array<keyof GlobalSections>;
    pages: PageDiff[];
    /** Sum across all pages — useful for "N changes" summaries. */
    totalChanges: number;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Util                                                                  */
/* ─────────────────────────────────────────────────────────────────── */

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

function isI18nValue(v: unknown): v is I18nString {
    if (!isPlainObject(v)) return false;
    const keys = Object.keys(v);
    if (keys.length === 0) return false;
    return keys.every(
        (k) =>
            (k === "en" || k === "ar" || k === "ku") &&
            (typeof v[k] === "string" || typeof v[k] === "undefined"),
    );
}

function sectionLabel(s: SectionInstance): string {
    if (s.label && s.label.trim().length > 0) return s.label;
    return s.type;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Section diff                                                          */
/* ─────────────────────────────────────────────────────────────────── */

function diffSection(
    prev: SectionInstance,
    next: SectionInstance,
): SectionChange | null {
    const deltas: FieldDelta[] = [];

    const baseA = isPlainObject(prev.base) ? prev.base : {};
    const baseB = isPlainObject(next.base) ? next.base : {};

    const keys = new Set<string>([...Object.keys(baseA), ...Object.keys(baseB)]);
    for (const key of keys) {
        const a = baseA[key];
        const b = baseB[key];
        if (deepEqual(a, b)) continue;

        if (
            key.endsWith("_i18n") ||
            isI18nValue(a) ||
            isI18nValue(b)
        ) {
            const aObj = (isPlainObject(a) ? a : {}) as Record<string, unknown>;
            const bObj = (isPlainObject(b) ? b : {}) as Record<string, unknown>;
            const locales = new Set<string>([
                ...Object.keys(aObj),
                ...Object.keys(bObj),
            ]);
            for (const loc of locales) {
                if (deepEqual(aObj[loc], bObj[loc])) continue;
                deltas.push({
                    field: key,
                    kind: "i18n",
                    locale: loc as LocaleCode,
                    before: aObj[loc],
                    after: bObj[loc],
                });
            }
            continue;
        }

        const scalar =
            typeof a !== "object" || a === null;
        const scalarB =
            typeof b !== "object" || b === null;
        if (scalar && scalarB) {
            deltas.push({ field: key, kind: "scalar", before: a, after: b });
        } else {
            deltas.push({ field: key, kind: "complex", before: a, after: b });
        }
    }

    // Surface variant / visibility / enabled flag changes as a single
    // "complex" delta so the merchant sees that something else moved.
    if (!deepEqual(prev.variants ?? [], next.variants ?? [])) {
        deltas.push({
            field: "variants",
            kind: "complex",
            before: prev.variants,
            after: next.variants,
        });
    }
    if (!deepEqual(prev.visibility ?? [], next.visibility ?? [])) {
        deltas.push({
            field: "visibility",
            kind: "complex",
            before: prev.visibility,
            after: next.visibility,
        });
    }
    if (prev.enabled !== next.enabled) {
        deltas.push({
            field: "enabled",
            kind: "scalar",
            before: prev.enabled,
            after: next.enabled,
        });
    }
    if ((prev.label ?? "") !== (next.label ?? "")) {
        deltas.push({
            field: "label",
            kind: "scalar",
            before: prev.label,
            after: next.label,
        });
    }

    if (deltas.length === 0) return null;

    return {
        kind: "modified",
        section_id: next.id,
        section_type: next.type,
        label: sectionLabel(next),
        deltas,
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Page diff                                                             */
/* ─────────────────────────────────────────────────────────────────── */

function diffPage(prev: PageConfig | undefined, next: PageConfig): PageDiff {
    const out: SectionChange[] = [];
    const prevSections = prev?.sections ?? [];
    const nextSections = next.sections;

    const prevById = new Map<string, SectionInstance>();
    for (const s of prevSections) prevById.set(s.id, s);
    const nextById = new Map<string, SectionInstance>();
    for (const s of nextSections) nextById.set(s.id, s);

    // Removed (present in prev, missing in next).
    for (const s of prevSections) {
        if (!nextById.has(s.id)) {
            out.push({
                kind: "removed",
                section_id: s.id,
                section_type: s.type,
                label: sectionLabel(s),
            });
        }
    }

    // Added / modified — iterate in next-order so the UI stays in document order.
    for (const s of nextSections) {
        const prior = prevById.get(s.id);
        if (!prior) {
            out.push({
                kind: "added",
                section_id: s.id,
                section_type: s.type,
                label: sectionLabel(s),
            });
            continue;
        }
        const diff = diffSection(prior, s);
        if (diff) out.push(diff);
    }

    return { page_id: next.page_id, changes: out };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Brand kit & globals                                                  */
/* ─────────────────────────────────────────────────────────────────── */

function brandKitChanged(a: BrandKit | undefined, b: BrandKit): boolean {
    if (!a) return true;
    return !deepEqual(a, b);
}

function diffGlobals(
    a: GlobalSections | undefined,
    b: GlobalSections,
): Array<keyof GlobalSections> {
    const slots: Array<keyof GlobalSections> = [
        "header",
        "footer",
        "promo_bar",
        "sticky_bottom_bar",
        "newsletter_popup",
        "analytics_pixels",
    ];
    const out: Array<keyof GlobalSections> = [];
    for (const slot of slots) {
        if (!deepEqual(a?.[slot], b[slot])) out.push(slot);
    }
    return out;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function computePublishDiff(
    prev: StoreConfigV2 | null | undefined,
    next: StoreConfigV2,
): PublishDiff {
    if (!prev) {
        // First publish — everything is "added".
        const pages: PageDiff[] = next.pages.map((p) => ({
            page_id: p.page_id,
            changes: p.sections.map((s) => ({
                kind: "added" as const,
                section_id: s.id,
                section_type: s.type,
                label: sectionLabel(s),
            })),
        }));
        const totalChanges = pages.reduce(
            (acc, p) => acc + p.changes.length,
            0,
        );
        return {
            isFirstPublish: true,
            brandKitChanged: true,
            globalsChanged: diffGlobals(undefined, next.globals),
            pages,
            totalChanges,
        };
    }

    const prevPagesById = new Map<PageId, PageConfig>();
    for (const p of prev.pages) prevPagesById.set(p.page_id, p);
    const nextPagesById = new Map<PageId, PageConfig>();
    for (const p of next.pages) nextPagesById.set(p.page_id, p);

    const pages: PageDiff[] = [];

    // Existing + modified + page-added (preserve next-config order for UI).
    for (const np of next.pages) {
        const pp = prevPagesById.get(np.page_id);
        const diff = diffPage(pp, np);
        if (diff.changes.length > 0) pages.push(diff);
    }
    // Pages removed entirely → surface as a page-level entry with all
    // its sections marked removed.
    for (const pp of prev.pages) {
        if (nextPagesById.has(pp.page_id)) continue;
        pages.push({
            page_id: pp.page_id,
            changes: pp.sections.map((s) => ({
                kind: "removed" as const,
                section_id: s.id,
                section_type: s.type,
                label: sectionLabel(s),
            })),
        });
    }

    const totalChanges = pages.reduce(
        (acc, p) => acc + p.changes.length,
        0,
    );

    return {
        isFirstPublish: false,
        brandKitChanged: brandKitChanged(prev.brand_kit, next.brand_kit),
        globalsChanged: diffGlobals(prev.globals, next.globals),
        pages,
        totalChanges,
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Formatters used by the side-sheet                                    */
/* ─────────────────────────────────────────────────────────────────── */

export function summarisePageChangeCounts(
    page: PageDiff,
): { added: number; removed: number; modified: number } {
    let added = 0;
    let removed = 0;
    let modified = 0;
    for (const c of page.changes) {
        if (c.kind === "added") added++;
        else if (c.kind === "removed") removed++;
        else modified++;
    }
    return { added, removed, modified };
}

export function humaniseFieldName(field: string): string {
    return field
        .replace(/_i18n$/g, "")
        .replace(/_/g, " ")
        .replace(/\bid\b/gi, "ID")
        .replace(/\bcta\b/gi, "CTA")
        .replace(/\burl\b/gi, "URL")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}
