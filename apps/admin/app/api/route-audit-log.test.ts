import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Round 1 of the staff console audit found 7 of 40 changing routes writing an
 * audit row: adding a staff login, approving a wallet top-up and exporting
 * every shop left no trace. A handler that changes data now has to do one of
 * three things, and a new route that does none fails here:
 *   1. call the logger in the route;
 *   2. call a database function that writes the row in its own transaction
 *      (checked against the newest migration that defines the function);
 *   3. be named in NO_STAFF_LOG with the reason it needs no row.
 */

const API_DIR = path.resolve(__dirname);
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../packages/supabase/migrations");
const CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOGS = /\b(logAdminAction|logAdminActivity|logAdminActivityBatch)\(/;

/** Reads that are logged all the same: they carry shop data out of the console. */
const LOGGED_READS = new Set(["export/route.ts GET"]);

/** Handlers whose database function writes the row, with that function's name. */
const LOGGED_IN_SQL: Record<string, string> = {
  "merchants/[id]/extend-trial/route.ts POST": "admin_extend_trial",
  "trials/extend/route.ts POST": "admin_extend_trial",
  "merchants/[id]/lock-orders/route.ts POST": "admin_add_lock_orders",
  "merchants/[id]/force-unlock/route.ts POST": "admin_force_unlock",
  "merchants/[id]/extend-subscription/route.ts POST": "admin_extend_subscription",
  "merchants/[id]/route.ts PATCH": "admin_update_shop",
};

/** Handlers that write no staff log row, each with why. */
const NO_STAFF_LOG: Record<string, string> = {
  "admin/last-actors/route.ts POST": "reads the log; POST only carries the list of shop ids",
  "admin/leads-table-layout/route.ts PUT": "the column layout of the leads table: no shop, money or access changes",
  "admin/watchlist/route.ts POST": "a person's own watch list",
  "admin/watchlist/[tenantId]/route.ts DELETE": "a person's own watch list",
  "support/push/route.ts POST": "a person's own device for support alerts; the row names its owner",
  "support/push/route.ts DELETE": "a person's own device for support alerts",
  "merchants/[id]/notes/route.ts POST": "the note row is the record: it names its author and the shop",
  "leads/route.ts POST": "a new sales lead; the lead row records who created it",
  "leads/[id]/route.ts PATCH": "everyday sales edit; a status change is written to the lead's own history",
  "leads/[id]/activities/route.ts POST": "is the lead's own history",
  "leads/[id]/follow-ups/route.ts POST": "a sales reminder on a lead",
  "leads/[id]/follow-ups/[fid]/route.ts PATCH": "a sales reminder on a lead",
  "leads/[id]/competitors/route.ts POST": "a sales note on a lead",
  "leads/[id]/competitors/route.ts DELETE": "a sales note on a lead",
  "leads/analyze-profile/route.ts POST": "reads a public profile and saves nothing",
};

const routeFiles = readdirSync(API_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(`${path.sep}route.ts`) || file === "route.ts")
  .map((file) => file.split(path.sep).join("/"))
  .sort();

const handlers = routeFiles.flatMap((file) => {
  const source = readFileSync(path.join(API_DIR, file), "utf8");
  const parts = source.split(/export async function (GET|POST|PUT|PATCH|DELETE)\b/);
  const found: { key: string; method: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    found.push({ key: `${file} ${parts[i]}`, method: parts[i], body: parts[i + 1] ?? "" });
  }
  return found;
});

const mustLeaveATrace = handlers.filter((handler) => CHANGING.has(handler.method) || LOGGED_READS.has(handler.key));

/** The newest definition of a database function, from its CREATE to the next one. */
function newestDefinition(fn: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .reverse();
  const start = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`, "i");
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const at = sql.search(start);
    if (at === -1) continue;
    const rest = sql.slice(at + 1);
    const next = rest.search(/CREATE OR REPLACE FUNCTION /i);
    return next === -1 ? rest : rest.slice(0, next);
  }
  return "";
}

describe("every changing admin route leaves a trace", () => {
  it("finds the changing handlers", () => {
    expect(mustLeaveATrace.length).toBeGreaterThan(40);
  });

  it.each(mustLeaveATrace.map((handler) => [handler.key, handler.body]))("%s", (key, body) => {
    const sqlFunction = LOGGED_IN_SQL[key];
    if (sqlFunction) {
      expect(newestDefinition(sqlFunction), `${sqlFunction} must insert into admin_activity_logs`).toMatch(
        /INSERT INTO public\.admin_activity_logs/i,
      );
      return;
    }
    if (key in NO_STAFF_LOG) {
      // A reason that is no longer true must go: the handler logs now.
      expect(body, `${key} logs: take it out of NO_STAFF_LOG`).not.toMatch(LOGS);
      return;
    }
    expect(body, `${key} changes data and writes no audit row`).toMatch(LOGS);
  });

  it("names only handlers that exist", () => {
    const known = new Set(handlers.map((handler) => handler.key));
    for (const key of [...Object.keys(NO_STAFF_LOG), ...Object.keys(LOGGED_IN_SQL), ...LOGGED_READS]) {
      expect(known.has(key), `${key} is not a handler any more`).toBe(true);
    }
  });
});
