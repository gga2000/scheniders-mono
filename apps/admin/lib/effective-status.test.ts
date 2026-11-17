import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveStatus, isPausedTrial } from "./effective-status";

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
