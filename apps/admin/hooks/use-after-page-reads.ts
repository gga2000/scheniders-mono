import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient, type Query, type QueryCache } from "@tanstack/react-query";

/**
 * The query meta of the shell's own badge and alarm reads (the bell, the menu
 * counts), so that the page's own reads can be told apart from them.
 */
export const SHELL_READ = { shellRead: true } as const;

/**
 * The latest a shell read waits, from when the shell asks: so a page that reads
 * nothing (an error page) still gets its badges and alarms.
 */
export const SHELL_READ_DEADLINE_MS = 4_000;

const isPageRead = (query: Query) => query.meta?.shellRead !== true;

/** Visits whose page reads have landed once: from then on the shell reads run as usual. */
const landed = new WeakSet<QueryCache>();

/**
 * Whether the page's own reads have landed: one has answered (data or an
 * error) and none is still running.
 */
export function pageReadsLanded(cache: QueryCache): boolean {
  const pageReads = cache.findAll({ predicate: isPageRead });
  return (
    pageReads.some((query) => query.state.dataUpdatedAt > 0 || query.state.errorUpdatedAt > 0) &&
    pageReads.every((query) => query.state.fetchStatus !== "fetching")
  );
}

/**
 * Whether the shell's badge and alarm reads may start: once the page's own
 * reads have landed on this visit, or at the latest SHELL_READ_DEADLINE_MS
 * after the shell asked. Round 15 (Speed): the shell's eight reads started
 * with the page's own, and every page's data landed about 0.5 to 1 s later
 * than it does alone. The shell reads pass it as `enabled` and SHELL_READ as
 * `meta`; a page that reads the same thing itself (Payments) is not held up,
 * and the shell's badge fills from its answer.
 */
export function useAfterPageReads(): boolean {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback(
    (onChange: () => void) => {
      const stop = cache.subscribe(onChange);
      const deadline = setTimeout(() => {
        landed.add(cache);
        onChange();
      }, SHELL_READ_DEADLINE_MS);
      return () => {
        stop();
        clearTimeout(deadline);
      };
    },
    [cache],
  );
  const read = () => {
    if (!landed.has(cache) && pageReadsLanded(cache)) landed.add(cache);
    return landed.has(cache);
  };
  return useSyncExternalStore(subscribe, read, () => false);
}
