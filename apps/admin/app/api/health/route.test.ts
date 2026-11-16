import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, SERVER_MAX_ROWS, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The Health page asked four questions and read each answer as "data or an
 * empty list", so a failed read drew "0 shops, all healthy". It also read one
 * capped list of shops. A failed read now answers 500, and every list is read
 * to its last row.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/health"));

const shop = (id: string, extra: Row = {}): Row => ({
  is_demo: false,
  id,
  business_name: `Shop ${id}`,
  plan: "starter",
  status: "active",
  city: "Baghdad",
  created_at: "2026-06-01T09:00:00Z",
  ...extra,
});

beforeEach(() => {
  // Mon 16 Nov 2026, 12:00 in Baghdad.
  vi.useFakeTimers({ now: new Date("2026-11-16T09:00:00Z"), toFake: ["Date"] });
  stub = supabaseStub();
  stub.state.tables.tenants = [shop("a"), shop("b", { status: "suspended" }), shop("c", { status: "trial" })];
  stub.state.tables.wallet = [
    { tenant_id: "a", balance_iqd: 40_000, threshold_iqd: 5_000 },
    { tenant_id: "b", balance_iqd: 1_000, threshold_iqd: 5_000 },
    { tenant_id: "c", balance_iqd: 0, threshold_iqd: 5_000 },
  ];
  // Two orders in the last 24 hours; the one a minute before the window is not counted.
  stub.state.tables.admin_order_facts = [
    { id: "o1", created_at: "2026-11-16T08:00:00Z" },
    { id: "o2", created_at: "2026-11-15T09:30:00Z" },
    { id: "o-old", created_at: "2026-11-15T08:59:00Z" },
  ];
  // Raw rows, the demo store's invented orders among them: never counted here.
  stub.state.tables.orders = [{ id: "o1" }, { id: "o2" }, { id: "demo-1" }, { id: "demo-2" }, { id: "demo-3" }];
  stub.state.tables.usage_tracking = [
    { tenant_id: "a", year: 2026, month: 11, orders_count: 12, team_members_count: 2 },
    { tenant_id: "c", year: 2026, month: 10, orders_count: 9, team_members_count: 1 },
  ];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("counts the shops and names the ones at risk, worst first", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.platformHealth).toEqual({
      totalTenants: 3,
      activeTenants: 1,
      trialTenants: 1,
      suspendedTenants: 1,
      ordersLast24h: 2,
    });
    expect(stub.tablesRead()).not.toContain("orders");
    expect(stub.callsTo("admin_order_facts.gte")).toEqual([["created_at", "2026-11-15T09:00:00.000Z"]]);
    // b: low balance 3 + no orders this month 2 + suspended 2. c: low balance 3 + no orders 2.
    expect(body.riskIndicators.map((risk: Row) => [risk.tenant_id, risk.risk_score])).toEqual([
      ["b", 7],
      ["c", 5],
    ]);
    expect(body.lowBalanceWallets).toEqual([
      { tenant_id: "c", business_name: "Shop c", balance_iqd: 0, threshold_iqd: 5_000 },
      { tenant_id: "b", business_name: "Shop b", balance_iqd: 1_000, threshold_iqd: 5_000 },
    ]);
  });

  it.each(["tenants", "wallet", "admin_order_facts", "usage_tracking"])(
    "answers 500, not zeros, when the %s read fails",
    async (table) => {
      stub.state.failing.add(table);
      const response = await call();
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Failed to fetch health data" });
    },
  );

  it("reads the shops past the 1,000 rows one request returns", async () => {
    const many = SERVER_MAX_ROWS + 500;
    stub.state.tables.tenants = Array.from({ length: many }, (_, i) => shop(`s${i}`));
    stub.state.tables.wallet = Array.from({ length: many }, (_, i) => ({
      tenant_id: `s${i}`,
      balance_iqd: i === many - 1 ? 0 : 40_000,
      threshold_iqd: 5_000,
    }));

    const body = await (await call()).json();
    expect(body.platformHealth.totalTenants).toBe(many);
    // The one low wallet is row 1,500: a single capped read never saw it.
    expect(body.lowBalanceWallets.map((wallet: Row) => wallet.tenant_id)).toEqual([`s${many - 1}`]);
  });

  it("puts a new shop in its Baghdad month", async () => {
    stub.state.tables.tenants = [
      // 00:30 on 1 Nov in Baghdad, still 31 Oct in UTC.
      shop("early", { created_at: "2026-10-31T21:30:00Z" }),
      shop("oct", { created_at: "2026-10-20T10:00:00Z" }),
      // 00:30 on 1 Oct in Baghdad.
      shop("oct-early", { created_at: "2026-09-30T21:30:00Z" }),
      shop("sep", { created_at: "2026-09-30T20:00:00Z" }),
    ];
    const body = await (await call()).json();
    expect(body.tenantGrowth).toEqual({ thisMonth: 1, lastMonth: 2 });
  });
});
