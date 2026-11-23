import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 23 (UX new 2, structure new 6): pages that keep what they showed when
 * a read fails ("isError && !data" swaps to the error page only when nothing
 * was ever read) said nothing when a later read failed: Merchants, the shop
 * page, Activity, Payments to check, Paying shops, WhatsApp costs, Team and
 * the lead page went on showing old numbers as today's. Each place that keeps
 * data now draws a `StaleLine`, which says the refresh failed and how old the
 * numbers are; it is the one place that says so, where the same block had
 * been pasted on 19 pages. Since round 24 the support desk is checked too.
 *
 * Round 24 (structure new 2): the guard counted only reads that keep their
 * data, so a read that swapped a good list for its error ("isError ? …")
 * was invisible to it. Leads (desk and phone), the shop timeline, its latest
 * orders, Lead numbers, the industries, the bell, the watchlist and the map's
 * counts all threw away what they showed on one failed re-read. A read's
 * error now stands in for its data only when there is none.
 *
 * Round 24 (UX new 7): a list or a page that never loaded said "No numbers
 * are shown" in its LoadError. LoadError now takes `shows`, as StaleLine takes
 * `kept`, and the two agree for each read.
 *
 * Round 25 (structure new 1): the guard read one spelling. A read whose error
 * flag was renamed (`isError: configsFailed`), asked with `isError ||`, or
 * tested as `x.isError && (<section><LoadError …` passed it while throwing
 * its data away: three settings cards, a team member, the commission
 * settings, the quick notes and the Leads numbers. Those spellings count too.
 */

const ROOT = join(__dirname, "..", "..");
const STALE_LINE = join(ROOT, "components", "shared", "stale-line.tsx");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

const count = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].length;

/** The names a read's error flag is given where it is taken apart: `const { isError: notesFailed } = …`. */
function errorFlagNames(source: string): string[] {
  return [...source.matchAll(/\{[^{}]*\bisError:\s*(\w+)[^{}]*\}\s*=(?![=>])/g)].map((m) => m[1]);
}

/** Every spelling of a read's error flag: `isError`, `read.isError`, or a name it was given. */
function errorFlags(source: string): string[] {
  return ["(?:\\w+\\.)*isError", ...errorFlagNames(source)];
}

/** Places that keep a read's data on a failure: they fall back only when there is none. */
function keptOnFailure(source: string): number {
  return errorFlags(source).reduce(
    (sum, flag) =>
      sum + count(source, new RegExp(`(?<![!.\\w])${flag}\\s*&&\\s*(?:!\\s*[\\w.]+|[\\w.]+\\.length\\s*===\\s*0)`, "g")),
    0,
  );
}

/**
 * Places that swap a read's data for its error: an error branch that does not
 * also ask whether anything was read. Passing the error on (`isError ? error
 * : null`) is not a swap, and neither is a write's own error line (`save.isError
 * && <p>…`): only a branch that draws the read's error in place of its data is.
 */
function dropsOnFailure(source: string): number {
  return errorFlags(source).reduce((sum, flag) => {
    const head = `(?<![!.\\w])${flag}`;
    const ternary = count(source, new RegExp(`${head}\\s*\\?(?![.?])(?!\\s*(?:[\\w.]+\\.)?error\\b)`, "g"));
    const early = count(source, new RegExp(`\\bif\\s*\\(\\s*${flag}\\s*(?:\\|\\|[^)]*)?\\)\\s*(?:\\{\\s*)?return\\b`, "g"));
    const either = count(source, new RegExp(`${head}\\s*\\|\\|(?![^)]*\\)\\s*(?:\\{\\s*)?return\\b)`, "g"));
    const block = count(
      source,
      new RegExp(`${head}\\s*&&\\s*\\(?\\s*(?:<(?!\\/)[^<>]*>\\s*)*<(?:LoadError|LoadFailedLine)\\b`, "g"),
    );
    return sum + ternary + early + either + block;
  }, 0);
}

/** Lines that say a refresh failed and how old what is kept is. */
function staleLines(source: string): number {
  return [...source.matchAll(/<StaleLine\b/g)].length;
}

/**
 * What each read says it shows, by the words it names the read with: a
 * StaleLine's `kept` and a LoadError's `shows`, each "numbers" when not given.
 */
function showsByWhat(source: string, tag: "StaleLine" | "LoadError"): Map<string, string> {
  const prop = tag === "StaleLine" ? "kept" : "shows";
  const said = new Map<string, string>();
  for (const [element] of source.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?\\/>`, "g"))) {
    const what = element.match(/\bwhat="([^"]+)"/)?.[1];
    if (what) said.set(what, element.match(new RegExp(`\\b${prop}="([^"]+)"`))?.[1] ?? "numbers");
  }
  return said;
}

/** Reads whose first-load error and stale line say they show different things. */
function mismatched(source: string): string[] {
  const stale = showsByWhat(source, "StaleLine");
  return [...showsByWhat(source, "LoadError")].flatMap(([what, shows]) => {
    const kept = stale.get(what);
    return kept !== undefined && kept !== shows ? [`${what}: LoadError shows="${shows}", StaleLine kept="${kept}"`] : [];
  });
}

/** The same line built by hand, beside the one component that builds it. */
function handBuilt(source: string): number {
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
    expect(staleLines("<StaleLine read={pageRead} what=\"the payments\" kept=\"list\" />")).toBe(1);
    expect(staleLines("<LoadFailedLine what=\"x\" onRetry={r} />")).toBe(0);
    expect(handBuilt("<LoadFailedLine what=\"x\" shownFrom={dataUpdatedAt} onRetry={r} />")).toBe(1);
    expect(dropsOnFailure("{isError ? <LoadError /> : <List />}")).toBe(1);
    expect(dropsOnFailure(") : timeline.isError ? (")).toBe(1);
    expect(dropsOnFailure("if (tasks.isError) return <LoadError />;")).toBe(1);
    expect(dropsOnFailure("{isError && !data ? <LoadError /> : <List />}")).toBe(0);
    expect(dropsOnFailure("<LoadError error={isError ? error : null} />")).toBe(0);
    expect(dropsOnFailure("<LoadError error={read.isError ? read.error : null} />")).toBe(0);
    expect(dropsOnFailure("if (save.isError) errorRef.current?.scrollIntoView();")).toBe(0);
    // Round 25: the other spellings of a dropped read, and their kept forms.
    const renamed = "const { data: configs, isError: configsFailed } = useCommissionConfigs();\n";
    expect(errorFlagNames(renamed)).toEqual(["configsFailed"]);
    expect(errorFlagNames("leadsCountLine({ count: data?.total, isError: neverRead })")).toEqual([]);
    expect(dropsOnFailure(`${renamed}{configsFailed ? <LoadFailedLine /> : <List />}`)).toBe(1);
    expect(dropsOnFailure(`${renamed}if (configsFailed) return null;`)).toBe(1);
    expect(dropsOnFailure(`${renamed}{configsFailed && !configs ? <LoadFailedLine /> : <List />}`)).toBe(0);
    expect(keptOnFailure(`${renamed}{configsFailed && !configs ? <LoadFailedLine /> : <List />}`)).toBe(1);
    expect(dropsOnFailure("if (isError || !data) return <LoadError />;")).toBe(1);
    expect(dropsOnFailure("{read.isError || !read.data ? <LoadError /> : <List />}")).toBe(1);
    expect(dropsOnFailure("{(!read.isError || read.data) && <List />}")).toBe(0);
    expect(dropsOnFailure('{tab === "Actions" && actions.isError && (\n  <section className="card">\n    <LoadError compact />')).toBe(1);
    expect(dropsOnFailure("{read.isError && <LoadFailedLine what=\"x\" onRetry={r} />}")).toBe(1);
    expect(dropsOnFailure('{addNote.isError && (\n  <p role="alert">Not saved. {addNote.error.message}</p>')).toBe(0);
    expect(dropsOnFailure("{read.isError && !read.data && (<section><LoadError /></section>)}")).toBe(0);
    expect(dropsOnFailure("const label = data?.name ?? (isError ? undefined : 'x');")).toBe(1);
    expect(dropsOnFailure("const n = read?.isError?.valueOf();")).toBe(0);
    const pair = (load: string, stale: string) =>
      mismatched(`<LoadError compact what="the leads"${load} onRetry={() => void refetch()} />\n<StaleLine read={r} what="the leads"${stale} />`);
    expect(pair(' shows="list"', ' kept="list"')).toEqual([]);
    expect(pair("", "")).toEqual([]);
    expect(pair("", ' kept="list"')).toEqual(['the leads: LoadError shows="numbers", StaleLine kept="list"']);
    expect(pair(' shows="page"', "")).toEqual(['the leads: LoadError shows="page", StaleLine kept="numbers"']);
  });

  it("never throws away what it showed because a later read failed", () => {
    const dropped = sources(join(ROOT, "app"))
      .concat(sources(join(ROOT, "components")))
      .flatMap((file) => {
        const drops = dropsOnFailure(readFileSync(file, "utf8"));
        return drops > 0 ? [`${file.slice(ROOT.length + 1)}: ${drops} error branch(es) with no "&& !data"`] : [];
      });
    expect(dropped).toEqual([]);
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

  it("names a list or a page the same way when it never loaded as when its refresh failed", () => {
    const differ = sources(join(ROOT, "app"))
      .concat(sources(join(ROOT, "components")))
      .flatMap((file) => mismatched(readFileSync(file, "utf8")).map((m) => `${file.slice(ROOT.length + 1)}: ${m}`));
    expect(differ).toEqual([]);
  });

  it("says it with the one stale line, never one built by hand", () => {
    const byHand = sources(join(ROOT, "app"))
      .concat(sources(join(ROOT, "components")))
      .filter((file) => file !== STALE_LINE && handBuilt(readFileSync(file, "utf8")) > 0)
      .map((file) => file.slice(ROOT.length + 1));
    expect(byHand).toEqual([]);
  });
});
