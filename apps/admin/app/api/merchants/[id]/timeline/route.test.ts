import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * The shop's one timeline reads three tables for the shop, newest first,
 * names the people from user_profiles, and pages with `before`. A refused
 * read is an error, never an empty list.
 */

const TENANT = "33333333-3333-4333-8333-333333333333";
const ALI = "aaaaaaaa-0000-4000-8000-000000000001";

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: ALI, email: "ali@x.co" }, role: "support_staff" }),
}));

type Answer = { data: unknown; error: unknown };
const TABLES: Record<string, Answer> = {};
/** Every chained call, per table: [method, ...args]. */
const calls: Array<[string, string, unknown[]]> = [];

function table(name: string): unknown {
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: Answer) => void) => resolve(TABLES[name] ?? { data: [], error: null });
      return (...args: unknown[]) => {
        calls.push([name, String(prop), args]);
        return chain;
      };
    },
  });
  return chain;
}

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({ from: (name: string) => table(name) }),
}));

const { GET } = await import("./route");

const call = (query = "") =>
  GET(new NextRequest(`http://admin.test/api/merchants/${TENANT}/timeline${query}`), {
    params: Promise.resolve({ id: TENANT }),
  });

beforeEach(() => {
  calls.length = 0;
  for (const name of Object.keys(TABLES)) delete TABLES[name];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/merchants/[id]/timeline", () => {
  it("lists the shop's money, staff steps and notes, newest first, with names", async () => {
    TABLES.wallet_transactions = {
      data: [{ id: "w1", type: "charge", amount_iqd: 55, balance_after_iqd: 945, description: "Order charge", created_by: null, created_at: "2026-11-16T10:00:00Z" }],
      error: null,
    };
    TABLES.admin_activity_logs = {
      data: [{ id: "l1", admin_user_id: ALI, admin_label: null, actor_email: "ali@x.co", action: "extend_trial", details: { days: 3 }, created_at: "2026-11-16T11:00:00Z" }],
      error: null,
    };
    TABLES.admin_notes = { data: [], error: null };
    TABLES.user_profiles = { data: [{ id: ALI, display_name: "Ali", email: "ali@x.co" }], error: null };

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nextBefore).toBeNull();
    expect(body.entries.map((e: { title: string; who: string }) => [e.title, e.who])).toEqual([
      ["Gave 3 free trial days", "Ali"],
      ["Order fee", "Automatic"],
    ]);
    for (const name of ["wallet_transactions", "admin_activity_logs", "admin_notes"]) {
      expect(calls).toContainEqual([name, "eq", ["tenant_id", TENANT]]);
    }
    expect(calls.some(([, method]) => method === "lt")).toBe(false);
  });

  it("reads the next page from before the time it was given", async () => {
    await call("?before=2026-11-15T10:00:00.000Z");
    for (const name of ["wallet_transactions", "admin_activity_logs", "admin_notes"]) {
      expect(calls).toContainEqual([name, "lt", ["created_at", "2026-11-15T10:00:00.000Z"]]);
    }
  });

  it("ignores a before that is not a time", async () => {
    await call("?before=yesterday");
    expect(calls.some(([, method]) => method === "lt")).toBe(false);
  });

  it("says so when a read is refused, instead of an empty list", async () => {
    TABLES.admin_notes = { data: null, error: { message: "permission denied" } };
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not load the timeline." });
  });
});
