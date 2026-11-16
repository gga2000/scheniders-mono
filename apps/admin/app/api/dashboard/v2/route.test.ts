import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { dashboardStats, incomeStats, SHOP_A, SHOP_B, usageStats } from "@/lib/console-stats.test-data";

/*
 * The dashboard fetched order and wallet rows and counted them in JavaScript.
 * The API returns at most 1,000 rows, so "All time" read 1,000 with 5,445
 * orders in the database, and a failed query drew zeros. It must read totals
 * the database counted and answer 500 when any of them is missing.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

type Answer = { data: unknown; error: { message: string } | null };
const rpcAnswers: Record<string, Answer> = {};
const tables: Record<string, Answer> = {};
const rpc = vi.fn(async (fn: string) => rpcAnswers[fn]);
const from = vi.fn((table: string) => {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => unknown) => resolve(tables[table]),
  };
  return chain;
});
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/dashboard/v2"));

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  rpcAnswers.admin_dashboard_stats = { data: dashboardStats(), error: null };
  rpcAnswers.admin_usage_stats = { data: usageStats(), error: null };
  rpcAnswers.admin_income_stats = { data: incomeStats(), error: null };
  tables.tenants = {
    data: [
      {
        id: SHOP_A,
        business_name: "Kut Shop",
        plan: "growth",
        status: "active",
        created_at: "2026-04-01T09:00:00Z",
        branding: { primary_color: "#0A7" },
        config_version: 2,
        wallet: [{ balance_iqd: "60000", total_topped_up_iqd: "100000" }],
      },
      {
        id: SHOP_B,
        business_name: "New Shop",
        plan: "starter",
        status: "trial",
        created_at: "2026-11-12T09:00:00Z",
        branding: null,
        config_version: 1,
        wallet: null,
      },
    ],
    error: null,
  };
  tables.subscriptions = { data: [], error: null };
  tables.admin_activity_logs = { data: [{ id: "log-1", action: "extend_trial" }], error: null };
  tables.tenant_members = { data: [{ tenant_id: SHOP_A }, { tenant_id: SHOP_A }], error: null };
});

describe("GET /api/dashboard/v2", () => {
  it("reads totals the database counted, and never fetches order or ledger rows", async () => {
    const res = await call();
    expect(res.status).toBe(200);

    expect(rpc.mock.calls.map(([fn]) => fn).sort()).toEqual([
      "admin_dashboard_stats",
      "admin_income_stats",
      "admin_usage_stats",
    ]);
    const read = from.mock.calls.map(([table]) => table);
    expect(read).not.toContain("orders");
    expect(read).not.toContain("wallet_transactions");
  });

  it("shows the true order counts and this month's figures", async () => {
    const body = await (await call()).json();

    expect(body.platformStats.at(-1)).toMatchObject({ label: "All time", value: 5445 });
    expect(body.kpis.totalOrders.value).toBe(237);
    expect(body.kpis.totalRevenue.value).toBe(8_083_500);
    // Fees only: the 79,000 of other wallet charges this month is not income.
    expect(body.kpis.mrr).toMatchObject({ label: "Our fees, Nov", value: 10_160 });
    expect(body.activityHeatmap).toHaveLength(365);
    expect(body.recentActivity).toEqual([{ id: "log-1", action: "extend_trial" }]);
  });

  it("names shops from the tenants table and fills their onboarding steps", async () => {
    const body = await (await call()).json();

    expect(body.topMerchants[0]).toMatchObject({ tenantId: SHOP_A, businessName: "Kut Shop", orderCount: 800 });
    const kut = body.onboarding.find((t: { tenantId: string }) => t.tenantId === SHOP_A);
    expect(kut.completedSteps).toEqual(["has_orders", "has_team", "has_branding", "has_storefront", "wallet_funded"]);
    expect(body.walletHealth).toMatchObject({ healthy: 1, critical: 1 });
  });

  it("answers 500 when the database totals cannot be read", async () => {
    rpcAnswers.admin_dashboard_stats = { data: null, error: { message: "permission denied" } };
    const res = await call();
    expect(res.status).toBe(500);
    // The database's own message stays on the server.
    expect(await res.json()).toEqual({ error: "Failed to fetch dashboard data" });
  });

  it.each(["tenants", "subscriptions", "admin_activity_logs", "tenant_members"])(
    "answers 500 when the %s query fails, instead of drawing the page without it",
    async (table) => {
      tables[table] = { data: null, error: { message: "connection reset" } };
      expect((await call()).status).toBe(500);
    },
  );
});
