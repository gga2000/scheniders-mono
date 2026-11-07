import type { StoreConfigV2 } from "@scheniders/shared";

/**
 * Whether a saved draft holds work the live store does not have yet.
 *
 * A draft row can exist and still match the live store exactly (an edit that
 * was autosaved and then undone). That is nothing to publish, so the editor
 * and the hub must not call it "unpublished changes". Both columns are jsonb,
 * which stores keys in a canonical order, so equal configs serialize the same.
 */
export function hasUnpublishedDraft(
    draft: StoreConfigV2 | null | undefined,
    published: StoreConfigV2 | null | undefined,
): boolean {
    if (!draft) return false;
    if (!published) return true;
    return JSON.stringify(draft) !== JSON.stringify(published);
}
