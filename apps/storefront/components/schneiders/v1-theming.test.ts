// W0.4 — the V1 fallback renderers must be themeable.
//
// These components still serve every tenant that has not published a V2
// config. They used to hardcode the Candy palette, so such a tenant's brand
// kit was ignored no matter what they set. This test fails the build if a
// fixed candy utility or a raw candy hex comes back.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIRS = [
    join(import.meta.dirname, "."),
    join(import.meta.dirname, "..", "..", "templates"),
];

function tsxFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return tsxFiles(p);
        return e.isFile() && p.endsWith(".tsx") && !p.includes(".test.") ? [p] : [];
    });
}

const FIXED_CANDY_HEX = /#(?:ff5a8a|7cf0bd|ffd84a|c5b6ff|9ad8ff|fff7ed)\b/i;

describe("V1 fallback renderers are brand-kit driven", () => {
    const files = DIRS.flatMap(tsxFiles);

    it("covers the files it claims to", () => {
        expect(files.length).toBeGreaterThan(15);
    });

    it("uses no fixed candy utility", () => {
        const offenders = files
            .map((f) => [f, [...readFileSync(f, "utf8").matchAll(/\bcandy-[a-z]+\b/g)].map((m) => m[0])] as const)
            .filter(([, hits]) => hits.length > 0)
            .map(([f, hits]) => `${f.split("/storefront/")[1]}: ${[...new Set(hits)].join(", ")}`);
        expect(offenders).toEqual([]);
    });

    it("uses no raw candy hex — an ink fallback inside a var() is fine", () => {
        const offenders = files
            .filter((f) => {
                // Strip `var(--bk-*, #hex)` fallbacks: those track the kit and
                // only apply outside a tenant wrapper.
                const src = readFileSync(f, "utf8").replace(/var\(--bk-[a-z-]+,\s*#[0-9a-f]{3,8}\)/gi, "");
                return FIXED_CANDY_HEX.test(src);
            })
            .map((f) => f.split("/storefront/")[1]);
        expect(offenders).toEqual([]);
    });
});
