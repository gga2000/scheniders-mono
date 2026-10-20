// A loading.tsx makes Next stream the shell, and the 200 with it, before the
// segments inside the boundary run. A notFound() or redirect() thrown inside
// can no longer set the status: a missing product turns into a soft 404 (200
// plus an injected noindex meta) and a merchant's 308 into a 200 with a meta
// refresh. Crawlers and ad link-checkers only read the status.
//
// So a status decision has to be made outside every loading boundary. Inside
// one, a page or layout may only reach a status through a guard from
// lib/route-guards that a layout OUTSIDE the boundary already called with the
// same route — the guards are React-cached, so the outer layout decides and
// the inner call just hands back the narrowed value.
//
// The live counterpart is scripts/route-status-check.mjs, which asserts the
// real statuses against a production build.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const APP_DIR = import.meta.dirname;
const RAW_STATUS_CALL = /\b(notFound|redirect|permanentRedirect|enforceRedirect)\s*\(/;

/** Source with comments removed, so prose about a redirect is not a call. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(APP_DIR);
const loadingDirs = files.filter((f) => f.endsWith(`${sep}loading.tsx`)).map(dirname);
const layouts = files.filter((f) => f.endsWith(`${sep}layout.tsx`));

const isSameOrAncestor = (ancestor: string, dir: string) =>
  dir === ancestor || dir.startsWith(`${ancestor}${sep}`);

/** The loading boundaries that wrap a file: a page sits inside the loading in
 *  its own segment; a layout sits OUTSIDE its own segment's loading. */
function wrappingBoundaries(file: string): string[] {
  const dir = dirname(file);
  const ownSegmentWraps = file.endsWith(`${sep}page.tsx`);
  return loadingDirs.filter((l) =>
    ownSegmentWraps ? isSameOrAncestor(l, dir) : l !== dir && isSameOrAncestor(l, dir),
  );
}

/** Names this file imports from the guard module. */
function importedGuards(src: string): string[] {
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/route-guards["']/);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("type "));
}

const wrapped = files
  .filter((f) => f.endsWith(`${sep}page.tsx`) || f.endsWith(`${sep}layout.tsx`))
  .map((file) => ({ file, boundaries: wrappingBoundaries(file) }))
  .filter(({ boundaries }) => boundaries.length > 0);

const rel = (f: string) => relative(APP_DIR, f);

describe("status decisions sit outside every loading boundary", () => {
  it("finds the loading boundaries (the scan is not vacuous)", () => {
    expect(wrapped.length).toBeGreaterThan(0);
  });

  it.each(wrapped.map((w) => [rel(w.file), w] as const))(
    "%s never calls notFound/redirect itself",
    (_name, { file }) => {
      const src = code(file);
      expect(src).not.toMatch(RAW_STATUS_CALL);
      expect(src).not.toMatch(/from\s*["']next\/navigation["']/);
    },
  );

  it.each(wrapped.map((w) => [rel(w.file), w] as const))(
    "%s only uses guards a layout outside its boundary already ran",
    (_name, { file, boundaries }) => {
      const guards = importedGuards(code(file));
      // The outermost boundary is the one that streams first.
      const outermost = boundaries.reduce((a, b) => (a.length <= b.length ? a : b));
      const outside = layouts.filter(
        (l) => isSameOrAncestor(dirname(l), outermost) && wrappingBoundaries(l).length === 0,
      );
      for (const guard of guards) {
        const decidedBy = outside.filter((l) =>
          new RegExp(`\\b${guard}\\s*\\(`).test(code(l)),
        );
        expect(
          decidedBy.map(rel),
          `${guard} must be called by a layout outside ${rel(outermost)}/loading.tsx`,
        ).not.toHaveLength(0);
      }
    },
  );

  it("guards every slug route that can 404 or redirect", () => {
    // The two routes whose missing slug must answer 404, and whose merchant
    // redirects must answer 308, from a layout above their skeleton.
    const guarded = [
      ["s/[tenant]/products/[slug]/layout.tsx", "requireProduct"],
      ["s/[tenant]/categories/[slug]/layout.tsx", "requireCategory"],
    ] as const;
    for (const [layout, guard] of guarded) {
      const src = code(join(APP_DIR, layout));
      expect(importedGuards(src), layout).toContain(guard);
      expect(wrappingBoundaries(join(APP_DIR, layout)), layout).toEqual([]);
    }
  });
});
