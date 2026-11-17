import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ON_TRIAL_FILTER, effectiveStatus, isPausedTrial } from "./effective-status";
import { rowPassesOr } from "./supabase-stub.test-data";

/*
 * Round 11: the database reads a paused shop as what it was before the pause
 * (tenant_effective_status), but the console's Trials page, Merchants digest
 * and shop card read the raw status, so a paused trial fell off all three.
 * The console now reads the same rule; this holds the two copies together.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../packages/supabase/migrations");

/** The newest body of the database's tenant_effective_status. */
function sqlRule(): string {
  const start = /CREATE OR REPLACE FUNCTION public\.tenant_effective_status\b/i;
  const latest =
    readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
      .filter((sql) => start.test(sql))
      .at(-1) ?? "";
  return latest.slice(latest.search(start)).split("$$;")[0] ?? "";
}

describe("effectiveStatus", () => {
  it("is the status of a shop that is not paused", () => {
    for (const status of ["trial", "active", "suspended", "cancelled"]) {
      expect(effectiveStatus(status, { status_before: "trial" })).toBe(status);
    }
  });

  it("is what a paused shop was before the pause", () => {
    expect(effectiveStatus("limited", { status_before: "trial" })).toBe("trial");
    expect(effectiveStatus("limited", { status_before: "active" })).toBe("active");
    expect(effectiveStatus("limited", { status_before: "suspended" })).toBe("suspended");
    expect(effectiveStatus("limited", { status_before: "cancelled" })).toBe("cancelled");
  });

  it("counts a pause written before status_before existed, or holding anything else, as active", () => {
    expect(effectiveStatus("limited", {})).toBe("active");
    expect(effectiveStatus("limited", null)).toBe("active");
    expect(effectiveStatus("limited", { status_before: "limited" })).toBe("active");
    expect(effectiveStatus("limited", { status_before: 7 })).toBe("active");
    expect(effectiveStatus("limited", "trial")).toBe("active");
  });

  it("names a paused trial, and only that", () => {
    expect(isPausedTrial("limited", { status_before: "trial" })).toBe(true);
    expect(isPausedTrial("trial", { status_before: "trial" })).toBe(false);
    expect(isPausedTrial("limited", { status_before: "active" })).toBe(false);
  });

  it("is the database's rule: the same statuses come back from a pause, the rest are active", () => {
    const body = sqlRule().replace(/\s+/g, " ");
    expect(body).toContain("WHEN _status IS DISTINCT FROM 'limited'::public.tenant_status THEN _status");
    expect(body).toContain("ELSE 'active'::public.tenant_status");
    const fromPause = [...body.matchAll(/WHEN _restrictions ->> 'status_before' = '(\w+)' THEN '(\w+)'::public\.tenant_status/g)];
    expect(fromPause.length).toBeGreaterThan(0);
    for (const [, before, becomes] of fromPause) {
      expect(effectiveStatus("limited", { status_before: before })).toBe(becomes);
    }
    // Every status the console gives back from a pause, the database gives back too.
    const sqlBefore = fromPause.map(([, before]) => before);
    for (const before of ["trial", "active", "suspended", "cancelled", "limited"]) {
      const read = effectiveStatus("limited", { status_before: before });
      expect(read === "active" || sqlBefore.includes(before)).toBe(true);
    }
  });
});

describe("ON_TRIAL_FILTER", () => {
  it("lists the shops effectiveStatus calls a trial, and no other", () => {
    const rows = [
      { status: "trial", restrictions: {} },
      { status: "limited", restrictions: { status_before: "trial" } },
      { status: "limited", restrictions: { status_before: "active" } },
      { status: "limited", restrictions: { status_before: "suspended" } },
      { status: "limited", restrictions: {} },
      { status: "limited", restrictions: null },
      { status: "active", restrictions: { status_before: "trial" } },
      { status: "suspended", restrictions: {} },
      { status: "cancelled", restrictions: {} },
    ];
    for (const row of rows) {
      expect(rowPassesOr(row, ON_TRIAL_FILTER), JSON.stringify(row)).toBe(effectiveStatus(row.status, row.restrictions) === "trial");
    }
  });
});

/*
 * Round 12: after #1389 the Merchants pill, count, filter and flag, shop
 * health, the smart alert, Home's plan movements and the support card still
 * read the raw status, so a paused trial dropped out of each. A raw "trial"
 * test is now either effectiveStatus or one of the places below, each with
 * its reason. A new one fails here until it is one or the other.
 */
const ADMIN_DIR = path.resolve(__dirname, "..");
const RAW_TRIAL = /status\s*[!=]==\s*"trial"|"trial"\s*[!=]==\s*[\w.]*status\b|\.eq\(\s*"status"\s*,\s*"trial"\s*\)/g;
const RAW_ON_PURPOSE: Record<string, { count: number; why: string }> = {
  "app/api/merchants/route.ts": { count: 1, why: "the ?status= the page asked for, not a shop's status" },
  "app/api/merchants/stats/route.ts": { count: 2, why: "the ?status= asked for, and the Pipeline's raw columns, which add up to the total" },
  "app/api/merchants/[id]/convert-trial/route.ts": { count: 1, why: "converting waits for the pause to lift" },
  "app/(dashboard)/merchants/[id]/page.tsx": { count: 1, why: "free days from the trial end only for a trial that is not paused" },
  "components/support/support-today.tsx": { count: 1, why: "shop_status comes from support_tasks_due, which reads tenant_effective_status" },
  "components/trials/trial-checks-panel.tsx": { count: 2, why: "the paused trial is answered first; the decisions wait for the pause to lift" },
  "lib/shop-actions.ts": { count: 2, why: "free days and Convert are refused on a paused shop" },
  "lib/support-shop-check.ts": { count: 1, why: "a paused shop is answered above it" },
  "lib/shop-status.ts": { count: 1, why: "a paused shop is answered above it" },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test(-data)?\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("the console's readers of a trial", () => {
  it("read effectiveStatus, or say why a paused trial must not count", () => {
    const found: Record<string, number> = {};
    for (const dir of ["app", "components", "hooks", "lib", "types"]) {
      for (const file of sourceFiles(path.join(ADMIN_DIR, dir))) {
        const count = readFileSync(file, "utf8").match(RAW_TRIAL)?.length ?? 0;
        if (count > 0) found[path.relative(ADMIN_DIR, file).split(path.sep).join("/")] = count;
      }
    }
    const allowed = Object.fromEntries(Object.entries(RAW_ON_PURPOSE).map(([file, { count }]) => [file, count]));
    expect(found).toEqual(allowed);
  });
});
