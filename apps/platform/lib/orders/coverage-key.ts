/**
 * Whether a cache loaded for window `loaded` holds every row of window `active`.
 *
 * Keys are `windowCacheKey` strings. A cache loaded for "all" (no date filter)
 * holds every window; any other window holds only itself. `null` means no
 * fetch has committed yet (or the cache was removed), which covers nothing.
 */
export function listCovers(loaded: string | null, active: string): boolean {
    return loaded !== null && (loaded === active || loaded === "all");
}
