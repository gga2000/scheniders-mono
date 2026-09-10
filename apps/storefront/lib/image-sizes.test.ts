// W7.2 — a `fill` image with no `sizes` silently defaults to 100vw, so an
// 80px cart thumbnail fetches a full-viewport file. On Iraqi mobile data that
// is the most expensive kind of mistake, and it is invisible in review.
//
// This walks the real source rather than testing a helper: the bug is a
// missing attribute, so only the source can prove it is gone.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = [
    join(import.meta.dirname, "..", "components"),
    join(import.meta.dirname, "..", "app"),
    join(import.meta.dirname, "..", "templates"),
    join(import.meta.dirname, "..", "..", "..", "packages", "sections", "src"),
];

function tsxFiles(dir: string): string[] {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    return entries.flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return e.name === "node_modules" || e.name === ".next" ? [] : tsxFiles(p);
        return e.isFile() && p.endsWith(".tsx") && !p.includes(".test.") ? [p] : [];
    });
}

/** `<Image ... />` blocks, with their 1-based line number. */
function imageTags(src: string): { body: string; line: number }[] {
    // `[\s\S]` rather than `.` with the `s` flag: the workspace targets
    // ES2017, where tsc rejects dotAll (TS1501).
    return [...src.matchAll(/<Image\b([\s\S]*?)\/>/g)].map((m) => ({
        body: m[1],
        line: src.slice(0, m.index).split("\n").length,
    }));
}

describe("every fill image declares the width it actually occupies", () => {
    const files = ROOTS.flatMap(tsxFiles).filter((f) => readFileSync(f, "utf8").includes('from "next/image"'));

    it("finds the files it is meant to check", () => {
        expect(files.length).toBeGreaterThan(20);
    });

    it("no <Image fill> is missing sizes", () => {
        const offenders: string[] = [];
        for (const f of files) {
            for (const { body, line } of imageTags(readFileSync(f, "utf8"))) {
                const isFill = /(?<![\w.])fill(?![\w:])/.test(body);
                const hasSizes = /\bsizes=(?:"[^"]*"|\{)/.test(body);
                if (isFill && !hasSizes) offenders.push(`${f.split("/storefront/")[1] ?? f}:${line}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
