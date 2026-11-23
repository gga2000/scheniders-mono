import { formatCount } from "@/lib/format";

/**
 * The Leads header line, on desktop and phone alike, or none. A list that
 * never loaded gets no line: the list says it could not load, and Lead
 * numbers count the leads from their own read, so "Could not count the leads"
 * here sat above "Leads, now 28" (round 25 UX new 3). Never "0 leads" while
 * the read is running (round 5).
 */
export function leadsCountLine(read: { count: number | undefined; neverRead: boolean }): string | null {
  if (read.neverRead) return null;
  if (read.count === undefined) return "Counting leads...";
  return `${formatCount(read.count)} ${read.count === 1 ? "lead" : "leads"} in the pipeline`;
}

/** Leads on a page of the table and card views. */
export const LEADS_PAGE_SIZE = 20;

/**
 * The page to move to when the list shrank under the open one (a delete, a
 * colleague's change): its new last page. Null while the page is in the list.
 */
export function pageAfterShrink(page: number, total: number): number | null {
  const last = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));
  return page > last ? last : null;
}
