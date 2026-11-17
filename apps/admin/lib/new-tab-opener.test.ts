import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 8 of the staff console audit: "Open Storefront" opened the shop's own
 * page with a handle back to the console tab. A merchant's script on that
 * page could have swapped the console for a fake sign-in page. Every new tab
 * now opens without that handle, and the console's pages tell the browser to
 * keep other sites' pages apart from them.
 */

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The arguments of the call whose "(" is at `open`, up to its matching ")". */
function argumentsAt(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")" && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/** Each `window.open(...)` call with its arguments, by file. */
function opens(): { file: string; call: string }[] {
  return ["app", "components", "hooks", "lib"].flatMap((dir) =>
    sourceFiles(join(ROOT, dir)).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [...source.matchAll(/window\.open\(/g)].map((m) => ({
        file: relative(ROOT, path),
        call: argumentsAt(source, m.index + m[0].length - 1),
      }));
    }),
  );
}

describe("new tabs never keep a handle on the console", () => {
  it("finds the calls it polices", () => {
    expect(opens().length).toBeGreaterThanOrEqual(5);
  });

  it("opens every other site's page without a way back", () => {
    const loose = opens().filter(({ file, call }) => {
      if (!call.includes('"_blank"')) return false;
      if (call.includes("noopener")) return false;
      // The demo store's tab opens empty on the click, so no pop-up blocker
      // stops it, and drops its opener before the merchant app loads in it.
      return !(file === "components/settings/demo-store-card.tsx" && call.startsWith('""'));
    });
    expect(loose).toEqual([]);
  });

  it("the demo store's empty tab drops its opener before it loads another site", () => {
    const card = readFileSync(join(ROOT, "components/settings/demo-store-card.tsx"), "utf8");
    expect(card).toMatch(/tab\.opener = null;\s*tab\.location\.href = url;/);
  });

  it("every console page asks the browser to keep other sites' pages apart", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(config).toContain('{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }');
  });
});
