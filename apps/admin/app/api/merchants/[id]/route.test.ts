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
  orders: { data: null, error: null, count: 4 },
};

/** What each table was asked for: [table, columns]. */
const selects: Array<[string, unknown]> = [];

/** Every builder method chains; awaiting it answers for the table it started on. */
function table(name: string): unknown {
  const answer: Answer = TABLES[name] ?? { data: null, error: null };
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: Answer) => void) => resolve(answer);
      return (...args: unknown[]) => {
        if (prop === "select") selects.push([name, args[0]]);
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

const { GET } = await import("./route");

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
  rpc.mockReset();
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
