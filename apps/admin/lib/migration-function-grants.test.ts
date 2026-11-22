import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Staff console audit, round 23 (5): migration 20261122192417 changed
 * support_log_shop_call's arguments, then repeated support_task_log's revoke
 * and grant instead of writing the new signature's own. The new function kept
 * PUBLIC execute until the next migration fixed it. Grants follow the exact
 * signature, so each new signature needs its own lines. These checks read the
 * migrations as they ship, in name order:
 *   1. every function a migration creates has a revoke from PUBLIC for that
 *      exact signature, in the same file or a later one (unless it is dropped);
 *   2. every revoke and grant names a signature that exists at that point, so a
 *      copied line that names another function's arguments fails;
 *   3. every migration a migration cites by name exists.
 * Trigger functions need no revoke: they cannot be called directly.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../packages/supabase/migrations");

/** Checked from the migration that stopped new functions getting PUBLIC execute by default. */
const CHECKED_FROM = "20261025173233";

/** Functions with no revoke from PUBLIC, each with why that is right. */
const NO_REVOKE: Record<string, string> = {
  "abandoned_cart_junk_reason(text,text,text,text)": "created under the no-auto-execute default: live grants are postgres and service_role only",
  "get_orders_aggregates(uuid,date,date,text,text,text,text,bool,text)": "created under the no-auto-execute default; granted to authenticated on purpose",
  "order_is_billable(orders)": "created under the no-auto-execute default: live grants are postgres and service_role only",
  "review_photo_paths_ok(uuid,text[])": "a storage policy calls it for every caller, so it is granted to anon and authenticated on purpose",
  "search_fold_arabic(text)": "folds text for search; pure and granted to everyone on purpose",
  "search_fold_phone(text)": "folds a phone number for search; pure and granted to everyone on purpose",
};

/** Grants on a signature these checks cannot see being created, each with why. */
const CREATED_UNSEEN: Record<string, string> = {
  "get_dashboard_metrics(text,uuid)": "20261114170956 makes it by rewriting the old definition inside EXECUTE",
};

/** Applied migrations that cite a file name that was never shipped; applied files are not edited. */
const STALE_CITES = new Set([
  "20261117033054_admin_change_leads_owner_check.sql -> 20261117014500_admin_change_leads",
  "20261122192341_support_reply_request_id.sql -> 20261122200000_support_staff_request_ids",
  "20261122192357_support_note_request_id.sql -> 20261122200000_support_staff_request_ids",
  "20261122192358_support_notice_request_id.sql -> 20261122200000_support_staff_request_ids",
  "20261122192417_support_call_request_id.sql -> 20261122200000_support_staff_request_ids",
]);

const TYPE_ALIASES: Record<string, string> = {
  "timestamp with time zone": "timestamptz",
  integer: "int",
  int4: "int",
  boolean: "bool",
  bigint: "int8",
  smallint: "int2",
  "double precision": "float8",
  "character varying": "varchar",
};

/** The text inside the parentheses that open at `open`, and where they close. */
function inParens(sql: string, open: number): { inside: string; close: number } {
  let depth = 0;
  for (let at = open; at < sql.length; at += 1) {
    if (sql[at] === "(") depth += 1;
    else if (sql[at] === ")") {
      depth -= 1;
      if (depth === 0) return { inside: sql.slice(open + 1, at), close: at };
    }
  }
  throw new Error(`unclosed parenthesis at ${open}`);
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** The argument types of a list, as `revoke ... on function f(types)` writes them. */
function argumentTypes(list: string, named: boolean): string {
  return splitTopLevel(list)
    .map((arg) => {
      let type = arg
        .replace(/\s+(default|=)\s[\s\S]*$/i, "")
        .trim()
        .replace(/^(in|out|inout|variadic)\s+/i, "");
      if (named) {
        const parts = /^("?[a-z_][a-z0-9_]*"?)\s+([\s\S]+)$/i.exec(type);
        if (parts && !/^(timestamp|character|double|time)$/i.test(parts[1])) type = parts[2];
      }
      const clean = type.toLowerCase().replace(/\s+/g, " ").trim().replace(/^public\./, "");
      return TYPE_ALIASES[clean] ?? clean;
    })
    .join(",");
}

type Step = { at: number; kind: "create" | "drop" | "revoke" | "grant"; fn: string; roles: string; trigger?: boolean };

/** What one migration does to public functions, in the order written. */
function stepsOf(sql: string): Step[] {
  const steps: Step[] = [];
  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)) {
    const args = inParens(sql, match.index + match[0].length - 1);
    const trigger = /^\s*returns\s+(event_)?trigger\b/i.test(sql.slice(args.close + 1));
    steps.push({ at: match.index, kind: "create", fn: `${match[1]}(${argumentTypes(args.inside, true)})`, roles: "", trigger });
  }
  for (const match of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\(/gi)) {
    const args = inParens(sql, match.index + match[0].length - 1);
    steps.push({ at: match.index, kind: "drop", fn: `${match[1]}(${argumentTypes(args.inside, false)})`, roles: "" });
  }
  for (const match of sql.matchAll(/\b(revoke|grant)\s[^;]*?\bon\s+function\s+([^;]*?)\s+(?:from|to)\s+([^;]*);/gi)) {
    const kind = match[1].toLowerCase() === "revoke" ? "revoke" : "grant";
    for (const named of match[2].matchAll(/public\.(\w+)\s*\(/gi)) {
      const args = inParens(match[2], named.index + named[0].length - 1);
      steps.push({ at: match.index, kind, fn: `${named[1]}(${argumentTypes(args.inside, false)})`, roles: match[3].toLowerCase() });
    }
  }
  return steps.sort((a, b) => a.at - b.at);
}

function readMigrations(): { file: string; sql: string; raw: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_.*\.sql$/.test(name))
    .sort()
    .map((file) => {
      const raw = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      return { file, raw, sql: raw.replace(/--[^\n]*/g, "") };
    });
}

/** Runs every migration's steps and lists what the checks find. */
function audit() {
  const live = new Map<string, { file: string; revoked: boolean; trigger: boolean }>();
  const unknownNames: string[] = [];
  for (const { file, sql } of readMigrations()) {
    for (const step of stepsOf(sql)) {
      if (step.kind === "create") {
        if (!live.has(step.fn)) live.set(step.fn, { file, revoked: false, trigger: step.trigger === true });
      } else if (step.kind === "drop") {
        live.delete(step.fn);
      } else {
        const known = live.get(step.fn);
        if (!known) {
          if (file >= CHECKED_FROM && !(step.fn in CREATED_UNSEEN)) unknownNames.push(`${file}: ${step.kind} ${step.fn}`);
        } else if (step.kind === "revoke" && /\bpublic\b/.test(step.roles)) {
          known.revoked = true;
        }
      }
    }
  }
  const noRevoke = [...live]
    .filter(([fn, state]) => state.file >= CHECKED_FROM && !state.trigger && !state.revoked && !(fn in NO_REVOKE))
    .map(([fn, state]) => `${state.file}: ${fn}`);
  return { live, noRevoke, unknownNames };
}

describe("migration function grants (round 23)", () => {
  const found = audit();

  it("revokes PUBLIC execute on every new function signature", () => {
    expect(found.noRevoke).toEqual([]);
  });

  it("names only signatures that exist in each revoke and grant", () => {
    expect(found.unknownNames).toEqual([]);
  });

  it("keeps the exception lists to functions that still exist", () => {
    for (const fn of Object.keys(NO_REVOKE)) expect(found.live.has(fn), fn).toBe(true);
  });

  it("revokes the shop call's newest signature, with its request id, and drops the old one", () => {
    expect(found.live.get("support_log_shop_call(uuid,uuid,text,text,text,text,uuid)")?.revoked).toBe(true);
    expect(found.live.has("support_log_shop_call(uuid,uuid,text,text,text,text)")).toBe(false);
  });

  it("finds a new signature left with no revoke", () => {
    const steps = stepsOf(`
      create or replace function public.demo_step(p_id uuid, p_request_id uuid default null) returns void language sql as $$ select 1 $$;
      revoke all on function public.demo_step(uuid) from public;`);
    expect(steps.map((step) => `${step.kind} ${step.fn}`)).toEqual(["create demo_step(uuid,uuid)", "revoke demo_step(uuid)"]);
  });

  it("cites only migrations that exist", () => {
    const files = readMigrations();
    const names = new Set(files.map(({ file }) => file.replace(/\.sql$/, "")));
    const missing = files
      .filter(({ file }) => file >= CHECKED_FROM)
      .flatMap(({ file, raw }) =>
        [...new Set(raw.match(/\b\d{14}_[a-z0-9_]+/g) ?? [])]
          .filter((cited) => !names.has(cited))
          .map((cited) => `${file} -> ${cited}`),
      )
      .filter((cite) => !STALE_CITES.has(cite));
    expect(missing).toEqual([]);
  });
});
