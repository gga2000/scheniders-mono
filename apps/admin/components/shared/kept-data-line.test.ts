import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 23 (UX new 2, structure new 6): pages that keep what they showed when
 * a read fails ("isError && !data" swaps to the error page only when nothing
 * was ever read) said nothing when a later read failed: Merchants, the shop
 * page, Activity, Payments to check, Paying shops, WhatsApp costs, Team and
 * the lead page went on showing old numbers as today's. Each place that keeps
 * data now draws the load-failed line with `shownFrom`, which says the
 * refresh failed and how old the numbers are. The support desk's files are
 * that thread's, and the one-trial checks panel is Fermi's (B5; asked 22 Nov).
 */

const ROOT = join(__dirname, "..", "..");
const SKIP = [
  join(ROOT, "app", "(dashboard)", "support"),
  join(ROOT, "components", "support"),
  join(ROOT, "components", "trials", "trial-checks-panel.tsx"),
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (SKIP.includes(path)) return [];
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

/** Places that keep a read's data on a failure: they fall back only when there is none. */
function keptOnFailure(source: string): number {
  return [...source.matchAll(/\bisError\s*&&\s*(?:!\s*[\w.]+|[\w.]+\.length\s*===\s*0)/g)].length;
}

/** Lines that say a refresh failed and how old what is kept is. */
function staleLines(source: string): number {
  return [...source.matchAll(/\bshownFrom=\{/g)].length;
}

describe("a page that keeps its last read when a read fails", () => {
  it("knows a kept read from a dropped one, and a stale line from a plain one", () => {
    expect(keptOnFailure("if (isError && !data) return <LoadError />;")).toBe(1);
    expect(keptOnFailure("if (isError && !employees) return null;")).toBe(1);
    expect(keptOnFailure("isError && merchants.length === 0 ? <LoadError /> : null")).toBe(1);
    expect(keptOnFailure("query.isError && !query.data")).toBe(1);
    expect(keptOnFailure("isError ? <LoadError /> : <List />")).toBe(0);
    expect(keptOnFailure("{decide.isError && <p>{decide.error.message}</p>}")).toBe(0);
    expect(staleLines("<LoadFailedLine what=\"x\" shownFrom={dataUpdatedAt} onRetry={r} />")).toBe(1);
    expect(staleLines("<LoadFailedLine what=\"x\" onRetry={r} />")).toBe(0);
  });

  it("says so when a later read fails, once for each read it keeps, on every page of the console", () => {
    const silent = sources(join(ROOT, "app"))
      .concat(sources(join(ROOT, "components")))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const kept = keptOnFailure(source);
        const said = staleLines(source);
        return said < kept ? [`${file.slice(ROOT.length + 1)}: keeps ${kept} read(s), says ${said}`] : [];
      });
    expect(silent).toEqual([]);
  });
});
