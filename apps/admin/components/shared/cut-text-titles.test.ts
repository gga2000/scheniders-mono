import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 17 (C-05, W-08): text cut with "…" had no way to read it whole: a
 * shop name on Home, 45 lines on Leads, the details on Activity. Every line
 * that is cut and shows one value now carries that value as its hover title.
 * The support desk's own files (components/support) are that thread's.
 */

const ROOT = join(__dirname, "..", "..");
const SKIP = [join(ROOT, "components", "support")];

function sources(dir: string): string[] {
  if (SKIP.includes(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

/** Tags that cut their text ("truncate") around one value, with no title. */
function cutWithoutTitle(source: string): string[] {
  const tag = /<(\w+)((?:\s[^<>]*?)?className=(?:"[^"]*\btruncate\b[^"]*"|\{[^{}]*\btruncate\b[^{}]*\}|\{cn\([^<>]*?\btruncate\b[^<>]*?\)\})[^<>]*?)>\s*\{([^{}<>]+)\}\s*<\/\1>/g;
  return [...source.matchAll(tag)].filter((m) => !m[2].includes("title=")).map((m) => `<${m[1]}> {${m[3].trim()}}`);
}

describe("text cut with an ellipsis", () => {
  it("knows a cut line with no title from one with a title", () => {
    expect(cutWithoutTitle('<span className="truncate">{lead.name}</span>')).toEqual(["<span> {lead.name}"]);
    expect(cutWithoutTitle('<span className="truncate" title={lead.name}>{lead.name}</span>')).toEqual([]);
    expect(cutWithoutTitle('<p className={cn("text-xs truncate", done && "x")}>\n  {item.title}\n</p>')).toEqual(["<p> {item.title}"]);
    expect(cutWithoutTitle('<span className="text-xs">{lead.name}</span>')).toEqual([]);
  });

  it("always has the whole text on its hover title, on every page of the console", () => {
    const missing = sources(join(ROOT, "components"))
      .concat(sources(join(ROOT, "app")))
      .flatMap((file) => cutWithoutTitle(readFileSync(file, "utf8")).map((hit) => `${file.slice(ROOT.length + 1)}: ${hit}`));
    expect(missing).toEqual([]);
  });
});
