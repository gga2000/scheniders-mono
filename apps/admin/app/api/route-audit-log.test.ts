import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { newestDefinition } from "@/lib/sql-migrations.test-data";

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
const CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOGS = /\b(logAdminAction|logAdminActivity|logAdminActivityBatch)\(/;

/** Reads that are logged all the same: they carry shop data out of the console. */
const LOGGED_READS = new Set(["export/route.ts GET"]);

/** Handlers whose database function writes the row, with that function's name. */
const LOGGED_IN_SQL: Record<string, string> = {
  "merchants/[id]/extend-trial/route.ts POST": "admin_extend_trial",
  "trials/extend/route.ts POST": "admin_extend_trial",
  "trial-checks/[id]/route.ts POST": "admin_trial_check_decide",
  "merchants/[id]/lock-orders/route.ts POST": "admin_add_lock_orders",
  "merchants/[id]/force-unlock/route.ts POST": "admin_force_unlock",
  "merchants/[id]/extend-subscription/route.ts POST": "admin_extend_subscription",
  "merchants/[id]/convert-trial/route.ts POST": "admin_convert_trial",
  "merchants/[id]/route.ts PATCH": "admin_update_shop",
  "leads/[id]/route.ts PATCH": "admin_save_lead",
  "leads/bulk/route.ts POST": "admin_change_leads",
  "leads/[id]/build-store/route.ts POST": "admin_build_prospect_store",
  "industries/[id]/move/route.ts POST": "admin_move_industry",
  "leads/[id]/route.ts DELETE": "admin_delete_leads",
  "industries/[id]/route.ts DELETE": "admin_remove_industry",
  "industries/[id]/route.ts PATCH": "admin_edit_industry",
  "industries/route.ts POST": "admin_add_industry",
  "support/view/route.ts POST": "support_view_start",
  "support/view/route.ts DELETE": "support_view_end",
  "support/tasks/route.ts POST": "support_task_log",
  "support/calls/route.ts POST": "support_log_shop_call",
  "merchants/[id]/product-import/route.ts POST": "admin_import_products",
  "merchants/[id]/product-import/images/route.ts POST": "admin_attach_product_images",
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
  "leads/[id]/activities/route.ts POST": "is the lead's own history",
  "leads/[id]/follow-ups/route.ts POST": "a sales reminder on a lead",
  "leads/[id]/follow-ups/[fid]/route.ts PATCH": "a sales reminder on a lead",
  "leads/analyze-profile/route.ts POST": "reads a public profile and saves nothing",
  "merchants/[id]/product-import/read/route.ts POST": "reads the file the team chose and saves nothing; POST only carries the file",
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

/** A database function writes the staff log row itself, or through a function it calls. */
function writesStaffLog(fn: string, seen = new Set<string>()): boolean {
  const definition = newestDefinition(fn);
  if (/INSERT INTO public\.admin_activity_logs/i.test(definition)) return true;
  seen.add(fn);
  return [...definition.matchAll(/public\.(\w+)\(/g)]
    .map((call) => call[1])
    .filter((called) => !seen.has(called))
    .some((called) => writesStaffLog(called, seen));
}

describe("every changing admin route leaves a trace", () => {
  it("finds the changing handlers", () => {
    expect(mustLeaveATrace.length).toBeGreaterThan(40);
  });

  it.each(mustLeaveATrace.map((handler) => [handler.key, handler.body]))("%s", (key, body) => {
    const sqlFunction = LOGGED_IN_SQL[key];
    if (sqlFunction) {
      expect(writesStaffLog(sqlFunction), `${sqlFunction} must insert into admin_activity_logs`).toBe(true);
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
