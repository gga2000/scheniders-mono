// The industry list is changed only with update_settings (app/api/industries).
// The lead forms showed their "Manage" link to every role, so support staff (4
// of the 7 staff on 17 Nov) got a bare "Forbidden" at every step. Every place
// that opens the manager now asks for that permission first, as Settings does.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const users = ["app", "components"]
  .flatMap((dir) => sources(join(ROOT, dir)))
  .filter((path) => readFileSync(path, "utf8").includes("<LeadIndustryManager"));

describe("who sees the industry manager", () => {
  it("is opened from the lead forms and Settings", () => {
    expect(users.map((path) => path.slice(ROOT.length + 1)).sort()).toEqual([
      "app/(dashboard)/settings/page.tsx",
      "components/leads/lead-form.tsx",
      "components/leads/mobile/lead-register-sheet.tsx",
    ]);
  });

  it.each(users.map((path) => [path.slice(ROOT.length + 1), path]))("%s shows it only to a role with update_settings", (_name, path) => {
    const text = readFileSync(path, "utf8");
    expect(text).toContain('"update_settings"');
    // The manager and its "Manage" opener both sit behind the permission.
    for (const at of [...text.matchAll(/<LeadIndustryManager/g)].map((m) => m.index ?? 0)) {
      expect(text.slice(Math.max(0, at - 40), at)).toMatch(/&& \(\s*$/);
    }
    for (const at of [...text.matchAll(/setI\w*Open\(true\)/g)].map((m) => m.index ?? 0)) {
      expect(text.slice(Math.max(0, at - 200), at)).toMatch(/&& \(\s*<button\s[^]*$/);
    }
  });
});
