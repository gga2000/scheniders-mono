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

/**
 * The `action:` of each `logAdminActivity({ ... })` in `text`, up to the
 * call's end: a plain name, or both names of a `cond ? "a" : "b"`.
 */
function activityCallNames(text: string): string[] {
  return [...text.matchAll(/logAdminActivity\(\{/g)].flatMap((call) => {
    const rest = text.slice(call.index);
    const body = rest.slice(0, rest.indexOf("});") + 1 || undefined);
    const action = body.match(/\baction:\s*(?:[^",}]*\?\s*)?"([a-z_]+)"(?:\s*:\s*"([a-z_]+)")?/);
    return action ? [action[1], ...(action[2] ? [action[2]] : [])] : [];
  });
}

/** Every action name the console's own code writes, with logAdminAction or logAdminActivity. */
function namesWrittenByTheConsole(): string[] {
  const names = new Set<string>();
  for (const file of [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib"))]) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/logAdminAction\(\s*[^,]+,\s*(?:[^"]*\?\s*)?"([a-z_]+)"(?:\s*:\s*"([a-z_]+)")?/g)) {
      names.add(match[1]);
      if (match[2]) names.add(match[2]);
    }
    for (const name of activityCallNames(text)) names.add(name);
  }
  return [...names].sort();
}

const MIGRATIONS = join(ROOT, "../../packages/supabase/migrations");

/** `s` cut at its commas outside brackets and quotes. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let part = "";
  for (const ch of s) {
    if (ch === "'") quoted = !quoted;
    if (!quoted && ch === "(") depth += 1;
    if (!quoted && ch === ")") depth -= 1;
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(part.trim());
      part = "";
    } else part += ch;
  }
  return [...parts, part.trim()];
}

/** Where the bracket opened at `open` closes. */
function closing(s: string, open: number): number {
  let depth = 0;
  let quoted = false;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === "'") quoted = !quoted;
    if (quoted) continue;
    if (s[i] === "(") depth += 1;
    if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * What every `INSERT INTO public.admin_activity_logs` in the migrations puts
 * in `action`: a name ('delete_lead'), a family ('trial_check_' || _decision),
 * or the `_actions || 'name'` steps a function collects first
 * (admin_update_shop). Anything else is returned as it is written, so a new
 * way of writing a name fails the test below instead of passing unread.
 */
function namesWrittenBySql(): { names: string[]; families: string[]; unread: string[] } {
  const names = new Set<string>();
  const families = new Set<string>();
  const unread: string[] = [];
  for (const file of readdirSync(MIGRATIONS).filter((name) => /^\d{14}_.*\.sql$/.test(name))) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/--[^\n]*/g, "");
    for (const insert of sql.matchAll(/INSERT INTO public\.admin_activity_logs\s*\(/gi)) {
      const open = (insert.index ?? 0) + insert[0].length - 1;
      const close = closing(sql, open);
      const at = splitTop(sql.slice(open + 1, close)).indexOf("action");
      const rest = sql.slice(close + 1);
      const values = rest.match(/^\s*VALUES\s*\(/i);
      const row = values
        ? splitTop(sql.slice(close + values[0].length + 1, closing(sql, close + values[0].length)))
        : splitTop(rest.slice(rest.search(/SELECT/i) + "SELECT".length, rest.search(/\bFROM\b/i)));
      const action = row[at] ?? "";
      const name = action.match(/^'([a-z_]+)'$/);
      const family = action.match(/^'([a-z_]+)'\s*\|\|/);
      if (name) names.add(name[1]);
      else if (family) families.add(family[1]);
      else if (/^e\.action$/.test(action)) {
        const collected = [...sql.matchAll(/_actions\s*\|\|\s*'([a-z_]+)'/g)].map((m) => m[1]);
        if (collected.length === 0) unread.push(`${file}: ${action}`);
        for (const step of collected) names.add(step);
      } else unread.push(`${file}: ${action}`);
    }
  }
  return { names: [...names].sort(), families: [...families].sort(), unread };
}

describe("kinds of step on the Activity page", () => {
  it("finds the names the console writes", () => {
    const names = namesWrittenByTheConsole();
    expect(names).toContain("approve_topup_request");
    expect(names).toContain("reject_topup_request");
    expect(names.length).toBeGreaterThan(15);
  });

  it("reads the names written straight through logAdminActivity too", () => {
    const names = namesWrittenByTheConsole();
    for (const name of ["top_up_wallet", "pause_tenant", "pause_whatsapp", "resume_whatsapp", "convert_trial"]) {
      expect(names, name).toContain(name);
    }
    expect(
      activityCallNames('await logAdminActivity({\n  adminUserId: id,\n  details: { a: 1 },\n  action: paused ? "pause_x" : "resume_x",\n});'),
    ).toEqual(["pause_x", "resume_x"]);
  });

  it("gives every name the console writes a kind, so no step hides from every filter", () => {
    const without = namesWrittenByTheConsole().filter((name) => activityKind(name) === null);
    expect(without).toEqual([]);
  });

  it("reads the names the database functions write, from the migrations", () => {
    const { names, families, unread } = namesWrittenBySql();
    expect(unread).toEqual([]);
    for (const name of ["status_change", "plan_change", "auto_renew_toggle", "extend_trial", "force_unlock", "build_store_for_lead", "delete_lead", "bulk_leads", "reassign_lead", "update_settings", "trial_withheld", "support_view", "support_view_end"]) {
      expect(names, name).toContain(name);
    }
    expect(families).toContain("trial_check_");
  });

  it("gives every name the database functions write a kind, so no step hides from every filter", () => {
    const { names, families } = namesWrittenBySql();
    expect(names.filter((name) => activityKind(name) === null)).toEqual([]);
    expect(families.filter((family) => activityKind(`${family}x`) === null)).toEqual([]);
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
