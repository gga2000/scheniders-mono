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
