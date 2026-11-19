import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (query = "") => GET(new NextRequest(`http://admin.test/api/paying-merchants${query}`));

const shop = (n: number, extra: Row = {}): Row => ({
  tenant_id: `shop-${n}`,
  display_id: 100_000 + n,
  name: `Shop ${n}`,
  plan: "starter",
  paid_until: "2026-12-10T09:00:00+00:00",
  month_end: "2026-12-10T09:00:00+00:00",
  first_paid_at: "2026-11-10T09:00:00+00:00",
  source: "signup",
  ...extra,
});

const answer = {
  at: "2026-11-18T23:30:00+00:00",
  shops: [shop(1), shop(2, { source: "outreach", plan: "growth" })],
  month_ends: [{ month: "2026-09", payers: 0 }, { month: "2026-10", payers: 3 }],
};

beforeEach(() => {
  stub = supabaseStub();
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.functions.admin_paying_merchants = () => ({ data: answer, error: null });
});

describe("GET /api/paying-merchants", () => {
  it("answers the shops paying now, their count, the month ends and the stop-rule goals", async () => {
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.shops.map((s: Row) => [s.display_id, s.source])).toEqual([[100_001, "signup"], [100_002, "outreach"]]);
    expect(body.month_ends).toEqual(answer.month_ends);
    expect(body.goals).toEqual([{ month: "2026-12", payers: 15 }, { month: "2027-01", payers: 60 }]);
    // Six months unless asked.
    expect(stub.state.rpcCalls).toEqual([{ fn: "admin_paying_merchants", args: { p_months: 6 } }]);
  });

  it("passes the months asked for and refuses a count the database would not take", async () => {
    await call("?months=12");
    expect(stub.state.rpcCalls.at(-1)?.args).toEqual({ p_months: 12 });

    for (const bad of ["0", "37", "1.5", "six", ""]) {
      expect((await call(`?months=${bad}`)).status).toBe(400);
    }
    expect(stub.state.rpcCalls).toHaveLength(1);
  });

  it("answers 500 when the read fails or comes back in the wrong shape, never zero payers", async () => {
    stub.state.functions.admin_paying_merchants = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call()).status).toBe(500);

    stub.state.functions.admin_paying_merchants = () => ({ data: { ...answer, shops: [{ tenant_id: "shop-1" }] }, error: null });
    expect((await call()).status).toBe(500);
  });
});
