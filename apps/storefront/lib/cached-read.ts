import { unstable_cache } from "next/cache";
import type { ReadHealth } from "./supabase/server";

/**
 * A read whose Supabase requests failed (timeout, dropped connection, 5xx).
 * Thrown inside `unstable_cache` so Next does not store the degraded result:
 * on a background refresh it keeps serving the last good value, and on a miss
 * the caller still gets the fallback, uncached, for this one request.
 */
class DegradedReadError<R> extends Error {
  constructor(readonly result: R) {
    super("storefront read degraded by a failed Supabase request");
  }
}

interface CachedReadOptions {
  revalidate: number;
  tags?: string[];
}

/**
 * `unstable_cache` for public storefront reads that never caches a failure.
 *
 * Every read here swallows its query errors into a fallback (null tenant,
 * empty list, products without review stats) so the page still answers. Left
 * alone, `unstable_cache` stored that fallback for the whole TTL, so one stalled
 * request blanked a block (or the whole store) for every visitor for a minute.
 * `read` must build its clients with the `health` it is given.
 */
export async function cachedRead<R>(
  keyParts: string[],
  options: CachedReadOptions,
  read: (health: ReadHealth) => Promise<R>,
): Promise<R> {
  try {
    return await unstable_cache(
      async () => {
        const health: ReadHealth = { failed: false };
        const result = await read(health);
        if (health.failed) throw new DegradedReadError(result);
        return result;
      },
      keyParts,
      options,
    )();
  } catch (error) {
    if (error instanceof DegradedReadError) return error.result as R;
    throw error;
  }
}
