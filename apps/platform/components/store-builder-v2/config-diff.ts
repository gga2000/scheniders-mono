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

export function formatPath(path: string[]): string {
    if (path.length === 0) return "(root)";
    let out = "";
    for (const segment of path) {
        if (/^\d+$/.test(segment)) {
            out += `[${segment}]`;
        } else if (out === "") {
            out = segment;
        } else {
            out += `.${segment}`;
        }
    }
    return out;
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
