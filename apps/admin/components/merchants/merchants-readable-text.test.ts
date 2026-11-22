import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The Merchants page Ali kept (16 Nov, "only old home and merchants") had 63
 * texts under 13 px and pale grey labels under 4.5:1. On 19 Nov he said go to
 * the drawing (admin audit concepts/r3-q2.png): same page, same places, same
 * colours; the labels are 13 px in plain case, and grey text is no fainter
 * than the console's muted ink. In this app text-xs is 13 px (app/globals.css).
 * The 13 px floor itself is checked for the whole console (components/readable-text.test.ts).
 * Icons keep their own tint, and placeholder, hover and focus tints stay.
 */

const ROOT = join(__dirname, "../..");
const FILES = [
  join(ROOT, "app/(dashboard)/merchants/page.tsx"),
  ...readdirSync(__dirname)
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => join(__dirname, name)),
];

/** Text ink fainter than text-foreground/70, outside icons and state variants. */
function faintText(source: string): string[] {
  const icons = new Set(["Icon"]);
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
    for (const name of m[1].split(",")) {
      const local = name.trim().split(/\s+as\s+/).pop();
      if (local) icons.add(local);
    }
  }
  return [...source.matchAll(/(?<![\w:/-])text-foreground\/(\d+)\b/g)].flatMap((m) => {
    if (Number(m[1]) >= 70) return [];
    const tag = source.slice(0, m.index).match(/<([A-Za-z][\w.]*)[^<>]*$/);
    return tag && icons.has(tag[1]) ? [] : [m[0]];
  });
}

/**
 * A shop's stored status key printed as is. #1476 took the capitals away, and
 * the Table, Sheet and Compare views then read "active" and "limited" where
 * the card says "Active" and "Paused" (round 17).
 */
function rawStatus(source: string): string[] {
  return [...source.matchAll(/(?<!=)\{\s*(?:\([^)]*\)|\w+)\.status\s*\}/g)].map((m) => m[0]);
}

/** Labels set in capitals. */
function capsText(source: string): string[] {
  return [...source.matchAll(/(?<![\w-])uppercase(?![\w-])/g)].map((m) => m[0]);
}

describe("Merchants text is readable", () => {
  it("reads the page and every Merchants component", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES.map((f) => relative(ROOT, f))).toContain("components/merchants/merchant-card.tsx");
  });

  it.each(FILES.map((f) => [relative(ROOT, f), f]))("%s has no faint ink, no capitals, no raw status key", (_name, file) => {
    const source = readFileSync(file, "utf8");
    expect(faintText(source)).toEqual([]);
    expect(capsText(source)).toEqual([]);
    expect(rawStatus(source)).toEqual([]);
  });

  it("the checks find what they look for", () => {
    expect(faintText(`<p className="text-foreground/45 text-foreground/70 placeholder:text-foreground/40 hover:text-foreground/50">`)).toEqual([
      "text-foreground/45",
    ]);
    expect(faintText(`import { Search } from "lucide-react";\n<Search className="w-4 h-4 text-foreground/30" />`)).toEqual([]);
    expect(capsText(`<span className="text-xs uppercase tracking-wider">`)).toEqual(["uppercase"]);
    expect(capsText(`const k = s.toUpperCase();`)).toEqual([]);
    expect(rawStatus(`<span>{m.status}</span><b>{(m as { status?: string }).status}</b>`)).toHaveLength(2);
    expect(rawStatus(`<span>{STATUS_LABELS[m.status]}</span><Chip status={m.status} />`)).toEqual([]);
  });
});
