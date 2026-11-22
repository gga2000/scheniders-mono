/**
 * When this browser read one page of a paged list. "Load more" moves a paged
 * read's own time to the newest page while the first pages on screen stay as
 * old as they were, so a list is as old as its oldest page (round 24 data
 * new 4). Each page's read stamps itself; the list asks for the oldest.
 */
export interface ReadAt {
  readAt: number;
}

export function stampRead<T extends object>(page: T, now: number = Date.now()): T & ReadAt {
  return { ...page, readAt: now };
}

/** The oldest page's read time, or `fallback` (the read's own time) when no page is held. */
export function oldestRead(pages: readonly ReadAt[] | undefined, fallback: number): number {
  return pages && pages.length > 0 ? Math.min(...pages.map((p) => p.readAt)) : fallback;
}
