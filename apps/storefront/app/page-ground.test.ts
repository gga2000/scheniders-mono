// =====================================================================
// The storefront wrappers paint the brand-kit ground
// =====================================================================
// `buildBrandKitVars` only DECLARES `--bk-*`; nothing consumes
// `--bk-surface` for the page unless the wrapper does, and globals.css gives
// `body` a font but no background. Without it a dark kit (Kinetic Ink,
// Chrome Night) renders its sections onto the browser's white, and every
// gap between sections blazes white. The section render guards cannot see
// this — they supply their own wrapper — so the wrappers are held here.
// =====================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(APP, rel), "utf8");

describe("page ground", () => {
  it("the tenant layout paints --bk-surface with --bk-ink as the inherited colour", () => {
    const src = read("s/[tenant]/layout.tsx");
    expect(src).toContain('backgroundColor: "var(--bk-surface, #fff7ed)"');
    expect(src).toContain('color: "var(--bk-ink, #1a1a1a)"');
  });

  it("both _preview wrappers paint the same ground (editor canvas + iframe)", () => {
    const src = read("%5Fpreview/[tenant]/[page_id]/page.tsx");
    expect(src).toContain('backgroundColor: "var(--bk-surface, #fff7ed)"');
    expect(src.match(/style=\{bkSurface\}/g)).toHaveLength(2);
    expect(src).not.toMatch(/style=\{bkVars\}/);
  });
});
