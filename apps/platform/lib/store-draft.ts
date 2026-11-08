import type { StoreConfigV2 } from "@scheniders/shared";

/**
 * Canonical JSON for comparing two store configs by meaning, not by shape.
 *
 * Keys are sorted, and empty arrays, empty objects, `null` and `undefined`
 * are dropped: an audience list created and then undone leaves
 * `segments: []` where the live store has no key at all, and that is
 * nothing to publish. Non-empty values compare exactly.
 */
export function canonicalConfigJson(value: unknown): string {
    return JSON.stringify(prune(value) ?? null);
}

function prune(value: unknown): unknown {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
        if (value.length === 0) return undefined;
        // Keep positions: a hole inside a list is still a list entry.
        return value.map((v) => prune(v) ?? null);
    }
    if (typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            const v = prune((value as Record<string, unknown>)[key]);
            if (v !== undefined) out[key] = v;
        }
        return Object.keys(out).length === 0 ? undefined : out;
    }
    return value;
}

/** Whether two configs would render and behave the same once published. */
export function sameStoreConfig(
    a: StoreConfigV2 | null | undefined,
    b: StoreConfigV2 | null | undefined,
): boolean {
    return canonicalConfigJson(a) === canonicalConfigJson(b);
}

/**
 * Whether a saved draft holds work the live store does not have yet.
 *
 * A draft row can exist and still match the live store (an edit that was
 * autosaved and then undone). That is nothing to publish, so the editor and
 * the hub must not call it "unpublished changes".
 */
export function hasUnpublishedDraft(
    draft: StoreConfigV2 | null | undefined,
    published: StoreConfigV2 | null | undefined,
): boolean {
    if (!draft) return false;
    if (!published) return true;
    return !sameStoreConfig(draft, published);
}
