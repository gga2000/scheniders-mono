import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

const guard = vi.hoisted(() => ({ allowed: true, actions: [] as string[] }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async (_request: unknown, action: string) => {
    guard.actions.push(action);
    return guard.allowed
      ? { user: { id: "a", email: "a@b.co" }, role: "super_admin" }
      : NextResponse.json({ error: "Your login cannot do this. Ask a super admin." }, { status: 403 });
  },
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (query = "") => GET(new NextRequest(`http://admin.test/api/staff-bonus${query}`));

const staff = (name: string, extra: Row = {}): Row => ({
  user_id: `u-${name}`, display_name: name, admin_role: "support_staff", is_active: true, ...extra,
});

const payingShop = (n: number): Row => ({
  tenant_id: `shop-${n}`, display_id: 100_000 + n, name: `Shop ${n}`, plan: "starter",
  paid_until: "2026-12-10T09:00:00+00:00", first_paid_at: "2026-11-10T09:00:00+00:00", source: "signup",
});

beforeEach(() => {
  stub = supabaseStub();
  guard.allowed = true;
  guard.actions = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.tables.admin_users = [
    staff("Mohammed"), staff("noor"), staff("karrar"),
    staff("left", { is_active: false }),
    staff("Ali", { admin_role: "super_admin" }),
  ];
  stub.state.functions.admin_paying_merchants = () => ({
    data: {
      // 01:30 on 1 December in Baghdad: the month still running is December.
      at: "2026-11-30T22:30:00+00:00",
      shops: [payingShop(1), payingShop(2)],
      month_ends: [{ month: "2026-10", payers: 0 }, { month: "2026-11", payers: 14 }],
    },
    error: null,
  });
});

describe("GET /api/staff-bonus", () => {
  it("pays each active support staff 250,000 plus 1,000 per shop paying at the month's end, newest month first", async () => {
    const body = await (await call()).json();

    expect(guard.actions).toEqual(["manage_commissions"]);
    // Active support staff only, in the database's name order.
    expect(body.people.map((p: Row) => p.name).sort()).toEqual(["Mohammed", "karrar", "noor"]);
    expect(stub.callsTo("admin_users.order")).toEqual([["display_name", { ascending: true }]]);
    expect(body.months).toEqual([
      { month: "2026-12", payers: 2, perPersonIqd: 252_000, totalIqd: 756_000, final: false },
      { month: "2026-11", payers: 14, perPersonIqd: 264_000, totalIqd: 792_000, final: true },
      // October is before the bonus began (BONUS_FROM_MONTH): not listed as pay owed.
    ]);
    expect(body.basePerPersonIqd).toBe(250_000);
    expect(body.perPayerIqd).toBe(1_000);
  });

  it("is for a login that manages staff pay only", async () => {
    guard.allowed = false;
    expect((await call()).status).toBe(403);
    expect(stub.state.rpcCalls).toHaveLength(0);
  });

  it("answers 500 when the payers or the team cannot be read, not a bonus of 250,000", async () => {
    stub.state.failing.add("admin_users");
    expect((await call()).status).toBe(500);

    stub.state.failing.clear();
    stub.state.functions.admin_paying_merchants = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call()).status).toBe(500);
  });

  it("refuses a month count the database would not take", async () => {
    expect((await call("?months=40")).status).toBe(400);
  });
});
