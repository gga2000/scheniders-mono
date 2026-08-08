// =====================================================================
// Section id rehashing
// =====================================================================
// Template definitions carry placeholder section ids (`__sale_page-1__`).
// Applying a template must always mint fresh ids — dnd-kit, undo/redo and
// per-variant overrides all key off `SectionInstance.id`, so re-applying a
// template with stale ids corrupts those references.
//
// Shared by both template kinds (page templates and store templates) so
// there is exactly one implementation of the deep-clone rules.
// =====================================================================

import type { SectionInstance } from "@scheniders/shared";

export function freshSectionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function deepCloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Clone `sections` with fresh ids. Deep-clones `base`, `variants` and
 * `visibility` so the canonical template object is never mutated by an
 * editor write.
 */
export function rehashSections(sections: SectionInstance[]): SectionInstance[] {
    return sections.map((s) => ({
        ...s,
        id: freshSectionId(),
        base: deepCloneJson(s.base),
        variants: s.variants
            ? s.variants.map((v) => ({ ...v, override: deepCloneJson(v.override) }))
            : undefined,
        visibility: s.visibility ? s.visibility.map((r) => ({ ...r })) : undefined,
    }));
}
