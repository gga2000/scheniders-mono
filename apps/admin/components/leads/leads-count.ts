import { countLine } from "@/lib/load-failure";
import { formatCount } from "@/lib/format";

/** The Leads header line, on desktop and phone alike. */
export function leadsCountLine(read: { count: number | undefined; isError: boolean }): string {
  return countLine(read, {
    loading: "Counting leads...",
    failed: "Could not count the leads",
    counted: (n) => `${formatCount(n)} ${n === 1 ? "lead" : "leads"} in the pipeline`,
  });
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
