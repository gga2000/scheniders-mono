import { wordList } from "./word-list";

/** A shop a bulk action did not do, as /api/bulk answers it. `name` is null when it could not be read. */
export type BulkFailure = { tenant_id: string; name?: string | null; error: string };

/** The most shops one bulk action takes (/api/bulk). */
export const BULK_MAX_SHOPS = 100;

/** Why a bulk action over these shops is refused before anything runs, or null. */
export function tooManyShops(count: number): string | null {
  return count > BULK_MAX_SHOPS ? `Pick at most ${BULK_MAX_SHOPS} shops (${count.toLocaleString("en-US")} ticked).` : null;
}

export function isBulkFailureList(value: unknown): value is BulkFailure[] {
  return (
    Array.isArray(value) &&
    value.every((f) => {
      if (typeof f !== "object" || f === null) return false;
      const { tenant_id, error, name } = f as Record<string, unknown>;
      return typeof tenant_id === "string" && typeof error === "string" && (name == null || typeof name === "string");
    })
  );
}

/**
 * One line per reason, naming the shops it held back, so staff know which
 * shops to look at: "Not done for Kut Shop and Najaf Gifts: <reason>". Past
 * three names the rest are counted; with no names it says how many.
 */
export function notDoneLines(failed: readonly BulkFailure[]): string[] {
  const byReason = new Map<string, BulkFailure[]>();
  for (const f of failed) byReason.set(f.error, [...(byReason.get(f.error) ?? []), f]);
  return [...byReason].map(([reason, shops]) => {
    const names = shops.flatMap((s) => (s.name ? [s.name] : [])).slice(0, 3);
    if (names.length === 0) return `${shops.length} not done: ${reason}`;
    const rest = shops.length - names.length;
    return `Not done for ${wordList(rest > 0 ? [...names, `${rest} more`] : names)}: ${reason}`;
  });
}
