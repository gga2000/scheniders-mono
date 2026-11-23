import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 25 (structure new 5): about 20 writers posted with adminFetch and threw
 * their own words, so a dropped connection read "Failed to fetch" and a
 * gateway's wordless 502 read "not saved" when the write may have landed.
 * Every write now goes through lib/send-json, which says it may have been done.
 * This guard fails on a new writer that skips it.
 */
const ROOT = join(__dirname, "..");

/** Calls that send a body but write nothing, or send a file the sender cannot: each says why. */
const NOT_WRITES: Record<string, string> = {
  "lib/send-json.ts": "the sender itself",
  "lib/download-export.ts": "asks for a file to download; writes nothing",
  "hooks/use-last-actors.ts": "reads badges for many shops in one POST; writes nothing",
  "components/leads/use-lead-form-controller.ts": "Analyze reads a public profile; writes nothing",
  "components/merchants/import/import-file-step.tsx": "uploads a file to be read, as form data; writes nothing",
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "api" ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

/** A request option that writes: `method: "POST",` and the like, not a type such as `method: "POST" | "PATCH"`. */
function writeOptions(source: string): number {
  return [...source.matchAll(/\bmethod:\s*"(?:POST|PATCH|PUT|DELETE)"\s*[,}]/g)].length;
}

describe("every console write goes through the one sender", () => {
  it("knows a write option from a method type", () => {
    expect(writeOptions('adminFetch(url, { method: "DELETE" })')).toBe(1);
    expect(writeOptions('adminFetch(url, {\n  method: "PATCH",\n  body })')).toBe(1);
    expect(writeOptions('function send(method: "POST" | "PATCH", body: unknown)')).toBe(0);
    expect(writeOptions('sendStep(url, body, "PUT", lost)')).toBe(0);
  });

  it("finds no writer outside lib/send-json", () => {
    const outside = ["app", "components", "hooks", "lib"]
      .flatMap((dir) => sources(join(ROOT, dir)))
      .map((file) => file.slice(ROOT.length + 1))
      .filter((file) => !(file in NOT_WRITES) && writeOptions(readFileSync(join(ROOT, file), "utf8")) > 0);
    expect(outside).toEqual([]);
  });
});
