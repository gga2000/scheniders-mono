import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { AdminRole } from "@/types/admin";

/*
 * The merchant record carries the store's billing lock (Fermi A1) as the shop
 * itself sees it, read with billing_lock_snapshot, and whether the viewing
 * staff member may unlock a store for free (super admins only).
 *
 * It also carries the shop's health score and its parts as the database
 * worked them out. The shop dialog used to add up the orders of every usage
 * month itself, the list took the newest month, so one shop showed two scores.
 *
 * Every part of the record is a read that can be refused. The team read was:
 * tenant_members has two keys to user_profiles, the embed did not say which,
 * and the route sent the refusal on as "no members" for every shop.
 *
 * PATCH (status, plan, auto-renew) wrote tenants, then subscriptions without
 * reading the error, then the log, and let any status go over any status.
 * It is one database call now (admin_update_shop), which also refuses.
 */

const state: { role: AdminRole } = { role: "super_admin" };
const TENANT = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "admin-1", email: "a@b.co" }, role: state.role }),
  requireAdminPermission: async () => ({ user: { id: "admin-1", email: "a@b.co" }, role: state.role }),
}));

type Answer = { data: unknown; error: unknown; count?: number };

const TABLES: Record<string, Answer> = {
  tenants: {
    data: {
      id: TENANT,
      plan: "starter",
      status: "trial",
      trial_ends_at: "2026-11-10T00:00:00Z",
      staff_health_score: 65,
      staff_health_parts: { status: 5, wallet: 5, orders: 5 },
    },
    error: null,
  },
  plan_limits: { data: [{ plan: "starter", max_orders_per_month: 500 }], error: null },
  admin_order_facts: { data: null, error: null, count: 4 },
};
const PARTS = ["wallet", "subscriptions", "usage_tracking", "tenant_members", "admin_notes", "admin_order_facts", "plan_limits"] as const;
const ORIGINAL = { ...TABLES };

/** What each table was asked for: [table, columns]. */
const selects: Array<[string, unknown]> = [];
/** Tables a handler wrote to from the route. PATCH must leave this empty. */
const writes: string[] = [];

/** Every builder method chains; awaiting it answers for the table it started on. */
function table(name: string): unknown {
  const answer: Answer = TABLES[name] ?? { data: null, error: null };
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: Answer) => void) => resolve(answer);
      return (...args: unknown[]) => {
        if (prop === "select") selects.push([name, args[0]]);
        if (prop === "update" || prop === "insert" || prop === "upsert" || prop === "delete") writes.push(name);
        return chain;
      };
    },
  });
  return chain;
}

const rpc = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({ from: (name: string) => table(name), rpc }),
}));

const { GET, PATCH } = await import("./route");

const call = () =>
  GET(new NextRequest(`http://admin.test/api/merchants/${TENANT}`), { params: Promise.resolve({ id: TENANT }) });

const LOCKED = {
  locked: true,
  reason: "trial_ended",
  since: "2026-11-10T00:00:00+00:00",
  orders_left: 12,
  allowance: 50,
  plan: "starter",
  price_iqd: 9000,
};

beforeEach(() => {
  state.role = "super_admin";
  selects.length = 0;
  writes.length = 0;
  rpc.mockReset();
  for (const name of Object.keys(TABLES)) delete TABLES[name];
  Object.assign(TABLES, ORIGINAL);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/merchants/[id] billing lock", () => {
  it("returns the lock the shop sees, read with the service role", async () => {
    rpc.mockResolvedValue({ data: LOCKED, error: null });
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("billing_lock_snapshot", { _tenant_id: TENANT });
    expect(body.billingLock).toEqual(LOCKED);
    expect(body.orderCount).toBe(4);
  });

  it.each([
    ["super_admin", true],
    ["support_staff", false],
  ] as const)("%s may unlock for free: %s", async (role, can) => {
    state.role = role;
    rpc.mockResolvedValue({ data: LOCKED, error: null });
    const body = await (await call()).json();
    expect(body.canForceUnlock).toBe(can);
  });

  it("an unlocked store comes back unlocked", async () => {
    rpc.mockResolvedValue({ data: { ...LOCKED, locked: false, reason: null, since: null, orders_left: null }, error: null });
    const body = await (await call()).json();
    expect(body.billingLock).toMatchObject({ locked: false, reason: null, orders_left: null });
  });

  it("reads the health score and its parts from the database, as the list does", async () => {
    rpc.mockResolvedValue({ data: LOCKED, error: null });
    const body = await (await call()).json();

    expect(selects).toContainEqual(["tenants", "*, staff_health_score, staff_health_parts"]);
    expect(body.tenant).toMatchObject({
      staff_health_score: 65,
      staff_health_parts: { status: 5, wallet: 5, orders: 5 },
    });
  });

  it("a lock that cannot be read fails the record instead of showing the store as unlocked", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    expect((await call()).status).toBe(500);

    rpc.mockResolvedValue({ data: { locked: "yes" }, error: null });
    expect((await call()).status).toBe(500);
  });
});

describe("GET /api/merchants/[id] parts of the record", () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: LOCKED, error: null });
  });

  it("reads each member's own profile by its key, and only what the Team tab shows", async () => {
    TABLES.tenant_members = {
      data: [{ id: "m1", user_id: "u1", role: "admin", status: "active", invited_at: null, joined_at: null, user_profiles: { email: "o@shop.iq", display_name: "Owner", avatar_url: null } }],
      error: null,
    };
    const body = await (await call()).json();

    expect(selects).toContainEqual([
      "tenant_members",
      "id, user_id, role, status, invited_at, joined_at, user_profiles!tenant_members_user_id_fkey(email, display_name, avatar_url)",
    ]);
    expect(body.team).toHaveLength(1);
  });

  it("counts real orders, not every row of the orders table", async () => {
    const body = await (await call()).json();

    expect(selects.map(([name]) => name)).toContain("admin_order_facts");
    expect(selects.map(([name]) => name)).not.toContain("orders");
    expect(body.orderCount).toBe(4);
  });

  it("a shop with no wallet and no subscription yet is still a record", async () => {
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ wallet: null, subscription: null, team: [], notes: [], usage: [] });
  });

  it("says who put a shop on hold and when, from the newest step that did it (board m9)", async () => {
    TABLES.tenants = { data: { ...(ORIGINAL.tenants.data as object), status: "suspended" }, error: null };
    TABLES.admin_activity_logs = {
      data: [
        { admin_user_id: null, admin_label: "system", actor_email: null, action: "status_change", details: { status: "trial" }, created_at: "2026-11-16T09:00:00Z" },
        { admin_user_id: "u-ali", admin_label: null, actor_email: "ali@x.co", action: "status_change", details: { status: "suspended" }, created_at: "2026-11-15T09:00:00Z" },
      ],
      error: null,
    };
    TABLES.user_profiles = { data: { id: "u-ali", display_name: "Ali", email: "ali@x.co" }, error: null };

    const body = await (await call()).json();

    expect(body.stoppedBy).toEqual({ who: "Ali", at: "2026-11-15T09:00:00Z" });
  });

  it("does not read the staff log for a running shop", async () => {
    const body = await (await call()).json();

    expect(body.stoppedBy).toBeNull();
    expect(selects.map(([name]) => name)).not.toContain("admin_activity_logs");
  });

  it.each(PARTS)("a refused read of %s fails the record instead of sending it as empty", async (name) => {
    TABLES[name] = { data: null, error: { code: "PGRST201", message: "more than one relationship was found" } };

    expect((await call()).status).toBe(500);
  });
});

describe("PATCH /api/merchants/[id]", () => {
  const patch = (body: unknown) =>
    PATCH(
      new NextRequest(`http://admin.test/api/merchants/${TENANT}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: TENANT }) },
    );

  const changed = (over: Record<string, unknown>) => ({
    data: { success: true, tenant_id: TENANT, status: "trial", plan: "starter", auto_renew: true, pending_plan: null, changed: [], ...over },
    error: null,
  });

  it("changes status, plan and auto-renew in one database call, with the acting admin, and writes no table itself", async () => {
    rpc.mockResolvedValue(changed({ status: "suspended", auto_renew: false, changed: ["status_change", "auto_renew_toggle"] }));
    const res = await patch({ status: "suspended", plan: "starter", auto_renew: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: TENANT,
      status: "suspended",
      plan: "starter",
      auto_renew: false,
      pending_plan: null,
      changed: ["status_change", "auto_renew_toggle"],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_update_shop", {
      _tenant_id: TENANT,
      _status: "suspended",
      _plan: "starter",
      _auto_renew: false,
      _admin_user_id: "admin-1",
      _actor_email: "a@b.co",
      _source: "single",
    });
    // The shop, its subscription and the log rows are the database call's.
    expect(writes).toEqual([]);
  });

  it("passes staff's reason for a hold on to the staff log, trimmed", async () => {
    rpc.mockResolvedValue(changed({ status: "suspended", changed: ["status_change"] }));
    const res = await patch({ status: "suspended", reason: "  Owner asked to stop for a month " });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "admin_update_shop",
      expect.objectContaining({ _status: "suspended", _reason: "Owner asked to stop for a month" }),
    );
  });

  it("refuses a reason too short to say anything, before the database", async () => {
    const res = await patch({ status: "suspended", reason: "no" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least 3 characters/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers with the status the shop really has: a suspended trial comes back on trial", async () => {
    rpc.mockResolvedValue(changed({ status: "trial", changed: ["status_change"] }));
    const res = await patch({ status: "active" });

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("trial");
  });

  it.each([
    ["still_trial", 409, "This shop is on trial. Use Convert to paid to make it a paying shop."],
    ["paused", 409, "This shop is paused. Resume it first."],
    ["use_pause", 409, "Use Pause to limit a shop: it sets what is blocked and for how long."],
    ["demo_store", 409, "This is the demo store. Its status does not change."],
    ["not_found", 404, "Merchant not found"],
  ])("a refusal %s is sent on with its reason, not as a server fault", async (code, status, error) => {
    rpc.mockResolvedValue({ data: { success: false, error: code }, error: null });
    const res = await patch({ status: "active" });

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it("a database error answers 500", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "deadlock detected" } });

    expect((await patch({ plan: "starter" })).status).toBe(500);
  });

  it.each([{}, { status: "frozen" }, { plan: "gold" }, { auto_renew: "yes" }])("refuses the body %j before the database", async (body) => {
    const res = await patch(body);

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
