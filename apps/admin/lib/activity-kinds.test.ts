import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activityKind, activityKindFilter, ACTIVITY_KINDS } from "./activity-kinds";

/*
 * The Activity filter offered nine names; seven were never written (login,
 * create, update, delete, suspend_tenant, impersonate, top_up_wallet), so a
 * filtered page read "No activity logged yet" over a full log. The kinds are
 * built from the names the console writes, and this test keeps them so.
 */

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test(-data)?\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Every action name the console's own code writes with logAdminAction. */
function namesWrittenByTheConsole(): string[] {
  const names = new Set<string>();
  for (const file of [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib"))]) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/logAdminAction\(\s*[^,]+,\s*(?:[^"]*\?\s*)?"([a-z_]+)"(?:\s*:\s*"([a-z_]+)")?/g)) {
      names.add(match[1]);
      if (match[2]) names.add(match[2]);
    }
  }
  return [...names].sort();
}

describe("kinds of step on the Activity page", () => {
  it("finds the names the console writes", () => {
    const names = namesWrittenByTheConsole();
    expect(names).toContain("approve_topup_request");
    expect(names).toContain("reject_topup_request");
    expect(names.length).toBeGreaterThan(15);
  });

  it("gives every name the console writes a kind, so no step hides from every filter", () => {
    const without = namesWrittenByTheConsole().filter((name) => activityKind(name) === null);
    expect(without).toEqual([]);
  });

  it("knows the steps the database functions write", () => {
    for (const name of ["status_change", "plan_change", "auto_renew_toggle", "extend_trial", "extend_subscription", "force_unlock", "add_lock_orders", "reassign_lead", "trial_check_confirmed"]) {
      expect(activityKind(name), name).not.toBeNull();
    }
  });

  it("puts every support step under Support", () => {
    expect(activityKind("support_case_solved")).toBe("support");
    expect(activityKind("support_notice_posted")).toBe("support");
    expect(activityKindFilter("support")).toBe("action.like.support_*");
  });

  it("names a kind's steps for the database, families and names together", () => {
    expect(activityKindFilter("notes")).toBe("action.in.(add_note,mention_in_note)");
    expect(activityKindFilter("shop")).toMatch(/^action\.in\.\(status_change,.*\),action\.like\.trial_check_\*$/);
  });

  it("puts no step in two kinds", () => {
    const all = ACTIVITY_KINDS.flatMap((kind) => kind.actions);
    expect(new Set(all).size).toBe(all.length);
  });
});
