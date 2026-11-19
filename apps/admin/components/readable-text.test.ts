import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * No text under 13 px anywhere in the console (app/globals.css: text-xs is
 * 13 px here, and no smaller size is used). The guard read only Merchants, and
 * the reason rule line in components/shared came in at 12 px (round 20). It
 * reads every page and component now. 0 px is not small text: it hides the
 * count inside a dot badge that names it in its aria-label.
 */

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [full] : [];
  });
}

const FILES = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "components"))];

/** Class names with text under 13 px. */
function smallText(source: string): string[] {
  return [...source.matchAll(/\btext-\[(\d+(?:\.\d+)?)px\]/g)]
    .filter((m) => Number(m[1]) > 0 && Number(m[1]) < 13)
    .map((m) => m[0]);
}

describe("console text is readable", () => {
  it("reads every page and component, the shared ones too", () => {
    const names = FILES.map((f) => relative(ROOT, f));
    expect(names).toContain("components/shared/staff-reason-input.tsx");
    expect(names).toContain("app/(dashboard)/merchants/page.tsx");
    expect(FILES.length).toBeGreaterThan(150);
  });

  it.each(FILES.map((f) => [relative(ROOT, f), f]))("%s has no text under 13 px", (_name, file) => {
    expect(smallText(readFileSync(file, "utf8"))).toEqual([]);
  });

  it("the check finds what it looks for", () => {
    expect(smallText(`<p className="text-[9px] text-[13px] text-[11px] text-[12.5px] text-[0px]">`)).toEqual([
      "text-[9px]",
      "text-[11px]",
      "text-[12.5px]",
    ]);
  });
});
