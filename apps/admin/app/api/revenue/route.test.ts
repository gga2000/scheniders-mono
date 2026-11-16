import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { incomeStats, SHOP_A, SHOP_B, SHOP_C } from "@/lib/console-stats.test-data";

/*
 * /api/revenue summed every wallet charge it could fetch (at most 1,000 rows)
 * and called it revenue: test reversals and corrections included, months cut
 * on the server's clock with the last day of each month dropped. It must read
 * fee totals the database made by Baghdad month and report other charges
 * apart.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

type Answer = { data: unknown; error: { message: string } | null };
let income: Answer;
let tenants: Answer;
const tenantSelects: string[] = [];
const rpc = vi.fn(async () => income);
const from = vi.fn((_table: string) => ({
  select: (cols: string) => {
    tenantSelects.push(cols);
    return Promise.resolve(tenants);
  },
}));
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/revenue"));

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  tenantSelects.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  income = { data: incomeStats(), error: null };
  tenants = {
    data: [
      { id: SHOP_A, business_name: "Kut Shop", created_at: "2026-04-01T09:00:00Z" },
      { id: SHOP_B, business_name: "New Shop", created_at: "2026-11-02T09:00:00Z" },
      { id: SHOP_C, business_name: "Quiet Shop", created_at: "2026-11-03T09:00:00Z" },
    ],
    error: null,
  };
});

describe("GET /api/revenue", () => {
  it("reads fee totals from the database and only shop names from tables", async () => {
    await call();

    expect(rpc).toHaveBeenCalledWith("admin_income_stats", {});
    expect(from.mock.calls.map(([table]) => table)).toEqual(["tenants"]);
    expect(tenantSelects.join(",")).not.toContain("wallets");
  });

  it("counts our fees as income and reports other charges apart", async () => {
    const body = await (await call()).json();

    expect(body.monthLabels).toEqual(["Jun 26", "Jul 26", "Aug 26", "Sep 26", "Oct 26", "Nov 26"]);
    expect(body.mrrWaterfall.at(-1)).toEqual({ month: "Nov 26", revenue: 10_160 });
    expect(body.mrrWaterfall.at(-2)).toEqual({ month: "Oct 26", revenue: 30_800 });
    // 79,000 of test reversals in November: a wallet charge, not income.
    expect(body.otherCharges).toBe(79_000);
  });

  it("splits the six months shown by plan, dropping older months", async () => {
    const body = await (await call()).json();

    expect(body.revenueByPlan).toEqual([
      { plan: "growth", data: [0, 0, 0, 0, 30_800, 1_160] },
      { plan: "starter", data: [0, 0, 0, 0, 0, 9_000] },
    ]);
  });

  it("names the shops and averages fees over every shop", async () => {
    const body = await (await call()).json();

    expect(body.topLTV).toEqual([
      { id: SHOP_A, name: "Kut Shop", revenue: 31_960 },
      { id: SHOP_B, name: "New Shop", revenue: 9_000 },
    ]);
    // Three shops, one of which never paid: (31,960 + 9,000 + 0) / 3.
    expect(body.avgLTV).toBe(13_653);
    expect(body.ltvDistribution[0]).toEqual({ label: "0 IQD", count: 1 });
    expect(body.cohorts.at(-1)).toEqual({ cohort: "2026-11", tenantCount: 2, months: [10_160, 0, 0, 0, 0, 0] });
  });

  it("returns 500 when a query fails instead of silently showing empty data", async () => {
    tenants = { data: null, error: { message: "relation does not exist" } };
    expect((await call()).status).toBe(500);
  });

  it("returns 500 when the fee totals cannot be read", async () => {
    income = { data: null, error: { message: "permission denied" } };
    expect((await call()).status).toBe(500);
  });
});
