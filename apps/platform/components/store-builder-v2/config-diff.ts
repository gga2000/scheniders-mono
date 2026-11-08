// =====================================================================
// config-diff — tiny recursive JSON diff used by Version History
// =====================================================================
// Produces a flat list of changes between two `StoreConfigV2` payloads
// (or any JSON values). We rolled our own to avoid adding a dependency
// (microdiff would otherwise be the smallest sensible option). The
// algorithm is structural:
//   • objects → diff keys; missing on right = "removed"; missing on left
//     = "added"; both present = recurse.
//   • arrays → align by index. Different lengths produce "added" /
//     "removed" entries for trailing positions.
//   • primitives → compare by strict equality.
// Order is stable: depth-first, in declared key order, with arrays
// expanded before non-array siblings.
// =====================================================================

import type { StoreConfigV2 } from "@scheniders/shared";

export type DiffKind = "added" | "removed" | "changed";

export interface DiffEntry {
    path: string[];
    kind: DiffKind;
    before?: unknown;
    after?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return (
        v !== null &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.getPrototypeOf(v) === Object.prototype
    );
}

/**
 * Map a non-empty array of objects by a stable string `id`, or null when the
 * array can't be safely keyed (empty, a non-object element, a missing/blank id,
 * or duplicate ids). Used to diff section/page lists by identity instead of by
 * index — so reordering one section doesn't report every later section as
 * "changed".
 */
function keyById(
    arr: unknown[],
): Map<string, Record<string, unknown>> | null {
    if (arr.length === 0) return null;
    const map = new Map<string, Record<string, unknown>>();
    for (const el of arr) {
        if (!isPlainObject(el) || typeof el.id !== "string" || !el.id) {
            return null;
        }
        if (map.has(el.id)) return null;
        map.set(el.id, el);
    }
    return map;
}

export function diffJson(
    before: unknown,
    after: unknown,
    path: string[] = [],
): DiffEntry[] {
    // Strict equality short-circuit (covers primitives and reference-equal objects).
    if (before === after) return [];

    // One side missing entirely.
    if (before === undefined) {
        return [{ path, kind: "added", after }];
    }
    if (after === undefined) {
        return [{ path, kind: "removed", before }];
    }

    // Arrays.
    if (Array.isArray(before) && Array.isArray(after)) {
        const beforeById = keyById(before);
        const afterById = keyById(after);

        // Both sides are id-keyed object lists (sections, pages, …) → align by
        // identity so a reorder doesn't masquerade as N content changes.
        if (beforeById && afterById) {
            const out: DiffEntry[] = [];
            const handled = new Set<string>();
            // Content diffs, in after-order (added ids surface as "added").
            for (const item of after as Record<string, unknown>[]) {
                const id = item.id as string;
                handled.add(id);
                out.push(...diffJson(beforeById.get(id), item, [...path, id]));
            }
            // Ids removed entirely.
            for (const item of before as Record<string, unknown>[]) {
                const id = item.id as string;
                if (!handled.has(id)) {
                    out.push(...diffJson(item, undefined, [...path, id]));
                }
            }
            // Reorder of the surviving (common) ids → a single "changed" at the
            // array path, instead of one per moved element.
            const orderBefore = (before as Record<string, unknown>[])
                .map((o) => o.id as string)
                .filter((id) => afterById.has(id));
            const orderAfter = (after as Record<string, unknown>[])
                .map((o) => o.id as string)
                .filter((id) => beforeById.has(id));
            if (orderBefore.some((id, i) => id !== orderAfter[i])) {
                out.push({
                    path,
                    kind: "changed",
                    before: orderBefore,
                    after: orderAfter,
                });
            }
            return out;
        }

        // Fallback: align by index (mixed/primitive arrays, dup/blank ids).
        const out: DiffEntry[] = [];
        const len = Math.max(before.length, after.length);
        for (let i = 0; i < len; i++) {
            out.push(...diffJson(before[i], after[i], [...path, String(i)]));
        }
        return out;
    }

    // Plain objects.
    if (isPlainObject(before) && isPlainObject(after)) {
        const out: DiffEntry[] = [];
        const keys = new Set<string>([
            ...Object.keys(before),
            ...Object.keys(after),
        ]);
        for (const key of keys) {
            out.push(...diffJson(before[key], after[key], [...path, key]));
        }
        return out;
    }

    // Type-mismatch or differing primitives → changed.
    // Final structural-equality check via JSON.stringify (deep value compare
    // for arrays/objects that landed here due to differing prototypes).
    try {
        if (JSON.stringify(before) === JSON.stringify(after)) return [];
    } catch {
        /* circular → fall through */
    }
    return [{ path, kind: "changed", before, after }];
}

export interface DiffSummary {
    added: number;
    removed: number;
    changed: number;
}

export function summarizeDiff(entries: DiffEntry[]): DiffSummary {
    let added = 0;
    let removed = 0;
    let changed = 0;
    for (const e of entries) {
        if (e.kind === "added") added++;
        else if (e.kind === "removed") removed++;
        else changed++;
    }
    return { added, removed, changed };
}

/** Group diff entries by a stable top-level bucket (first path segment). */
export function groupDiffByTop(entries: DiffEntry[]): Record<string, DiffEntry[]> {
    const out: Record<string, DiffEntry[]> = {};
    for (const e of entries) {
        const key = e.path[0] ?? "(root)";
        if (!out[key]) out[key] = [];
        out[key].push(e);
    }
    return out;
}

/* ─────────────────────────────────────────────────────────────────── */
/* What a restore would switch off                                      */
/* ─────────────────────────────────────────────────────────────────── */

/** Selling programmes a restore can switch off, by their settings screen. */
export type LiveProgram = "loyalty" | "free_gift" | "cart_recovery" | "bundles" | "discounts";

export interface RestoreLosses {
    /** Names of tests running now that would no longer be running. */
    tests: string[];
    /** Programmes on now that would be off (or gone) after the restore. */
    programs: LiveProgram[];
}

const isOn = (c: { enabled?: boolean } | undefined): boolean => c?.enabled === true;

/** Active list items (enabled unless explicitly false) missing from `target`. */
function losesActiveItem<T extends { enabled?: boolean }>(
    now: readonly T[] | undefined,
    target: readonly T[] | undefined,
    key: (x: T) => string,
): boolean {
    const kept = new Set((target ?? []).filter((x) => x.enabled !== false).map(key));
    return (now ?? []).some((x) => x.enabled !== false && !kept.has(key(x)));
}

/**
 * Live things a restore of `target` over `current` would stop. A long diff
 * lists these as ordinary rows; the restore screen names them up front so
 * stopping a running test or the points programme is never a surprise.
 */
export function restoreLosses(current: StoreConfigV2, target: StoreConfigV2): RestoreLosses {
    const runningAfter = new Set(
        (target.experiments ?? []).filter((e) => e.status === "running").map((e) => e.id),
    );
    const tests = (current.experiments ?? [])
        .filter((e) => e.status === "running" && !runningAfter.has(e.id))
        .map((e) => e.name);
    const now = current.commerce;
    const after = target.commerce;
    const programs: LiveProgram[] = [];
    if ((isOn(now?.loyalty) && !isOn(after?.loyalty)) || (isOn(now?.referral) && !isOn(after?.referral))) {
        programs.push("loyalty");
    }
    if (isOn(now?.free_gift) && !isOn(after?.free_gift)) programs.push("free_gift");
    if (isOn(now?.cart_recovery) && !isOn(after?.cart_recovery)) programs.push("cart_recovery");
    if (losesActiveItem(now?.bundles, after?.bundles, (b) => b.id)) programs.push("bundles");
    if (losesActiveItem(now?.discounts, after?.discounts, (d) => d.code.toLowerCase())) programs.push("discounts");
    return { tests, programs };
}
