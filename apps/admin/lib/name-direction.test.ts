import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 10 of the staff console audit: a shop or lead name that starts in
 * Arabic, cut with "…" in the console's left-to-right boxes, lost its first
 * letters ("…جر تجريبي" for "متجر تجريبي"), because the box is cut on its
 * right and an Arabic name starts on its right. The `name-dir` utility
 * (app/globals.css) lays each name out in the direction of its own first
 * letter, so it is cut at its own end, and keeps it left-aligned.
 */

const ROOT = join(__dirname, "..");
const NAME = /\b(business_name|merchant_name|name_ar)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

/**
 * Each element whose text starts with a name and whose box cuts its text:
 * the opening tag before `{…name…}`. A `<` only opens a tag in these files,
 * while an attribute such as `onClick={() => …}` may hold a `>`.
 */
function cutNames(source: string): string[] {
  return [...source.matchAll(/>\s*\{[^}]*?\b(?:business_name|merchant_name|name_ar)\b/g)].flatMap((match) => {
    const tag = source.slice(source.lastIndexOf("<", match.index), match.index + 1);
    return /\btruncate\b/.test(tag) ? [tag] : [];
  });
}

describe("a name cut with …", () => {
  const files = ["app", "components"].flatMap((dir) => sourceFiles(join(ROOT, dir)));

  it("is found in the console's lists, cards and chips (the check reads them)", () => {
    const found = files.filter((file) => cutNames(readFileSync(file, "utf8")).length > 0);
    expect(found.length).toBeGreaterThan(15);
    expect(NAME.test("{merchant.business_name}")).toBe(true);
  });

  it("is laid out in its own direction, so an Arabic name keeps its first letters", () => {
    const wrong = files.flatMap((file) =>
      cutNames(readFileSync(file, "utf8"))
        .filter((tag) => !/\bname-dir\b/.test(tag) && !/\sdir=/.test(tag))
        .map((tag) => `${relative(ROOT, file)}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`),
    );
    expect(wrong).toEqual([]);
  });

  it("stays left-aligned like every other row", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    const rule = css.match(/@utility name-dir \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/unicode-bidi:\s*plaintext/);
    expect(rule).toMatch(/text-align:\s*left/);
  });
});
