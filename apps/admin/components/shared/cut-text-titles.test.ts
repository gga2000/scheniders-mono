import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 17 (C-05, W-08): text cut with "…" had no way to read it whole: a
 * shop name on Home, 45 lines on Leads, the details on Activity. Every line
 * that is cut now carries its whole text as its hover title. Seen live after
 * #1497: lines that mix values ("327 orders · Active 11 h ago") were still
 * cut with no title, so the rule is now every cut tag, not one-value tags.
 * A tag whose text sits in an inner tag with its own title (CopyableText
 * has one) passes. The support desk's own files (components/support) are
 * that thread's.
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

/** Tags that cut their text ("truncate") with no title on them or inside them. */
function cutWithoutTitle(source: string): string[] {
  const open = /<(\w+)((?:\s[^<>]*?)?className=(?:"[^"]*\btruncate\b[^"]*"|\{[^{}]*\btruncate\b[^{}]*\}|\{cn\([^<>]*?\btruncate\b[^<>]*?\)\})[^<>]*?)>/g;
  return [...source.matchAll(open)].flatMap((m) => {
    if (m[2].includes("title=") || m[2].trimEnd().endsWith("/")) return [];
    const from = (m.index ?? 0) + m[0].length;
    const close = source.indexOf(`</${m[1]}>`, from);
    const inner = source.slice(from, close < 0 ? from : close);
    if (inner.includes("title=") || inner.includes("<CopyableText")) return [];
    return [`<${m[1]}> ${inner.replace(/\s+/g, " ").trim().slice(0, 60)}`];
  });
}

describe("text cut with an ellipsis", () => {
  it("knows a cut line with no title from one with a title", () => {
    expect(cutWithoutTitle('<span className="truncate">{lead.name}</span>')).toEqual(["<span> {lead.name}"]);
    expect(cutWithoutTitle('<span className="truncate" title={lead.name}>{lead.name}</span>')).toEqual([]);
    expect(cutWithoutTitle('<p className={cn("text-xs truncate", done && "x")}>\n  {item.title}\n</p>')).toEqual(["<p> {item.title}"]);
    expect(cutWithoutTitle('<span className="text-xs">{lead.name}</span>')).toEqual([]);
    expect(cutWithoutTitle('<p className="truncate">\n  {orders} orders\n  <span>{active}</span>\n</p>')).toEqual([
      "<p> {orders} orders <span>{active}</span>",
    ]);
    expect(cutWithoutTitle('<a className="truncate"><Globe /><span title={url}>{url}</span></a>')).toEqual([]);
    expect(cutWithoutTitle('<div className="truncate"><CopyableText value={m.slug} /></div>')).toEqual([]);
  });

  it("always has the whole text on its hover title, on every page of the console", () => {
    const missing = sources(join(ROOT, "components"))
      .concat(sources(join(ROOT, "app")))
      .flatMap((file) => cutWithoutTitle(readFileSync(file, "utf8")).map((hit) => `${file.slice(ROOT.length + 1)}: ${hit}`));
    expect(missing).toEqual([]);
  });
});
