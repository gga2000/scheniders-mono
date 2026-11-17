import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { dashboardStats, incomeStats, SHOP_A, SHOP_B, usageStats } from "@/lib/console-stats.test-data";
import { SERVER_MAX_ROWS, supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The dashboard fetched order and wallet rows and counted them in JavaScript.
 * The API returns at most 1,000 rows, so "All time" read 1,000 with 5,445
 * orders in the database, and a failed query drew zeros. It must read totals
 * the database counted and answer 500 when any of them is missing.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/dashboard/v2"));

const quietShop = (n: number): Row => ({
  id: `shop-${String(n).padStart(5, "0")}`,
  is_demo: false, is_prospect: false,
  business_name: `Shop ${n}`,
  plan: "starter",
  status: "active",
  created_at: "2026-05-01T09:00:00Z",
  branding: null,
  store_config_rev: 0,
  wallet: [{ balance_iqd: "60000", total_topped_up_iqd: "0" }],
});

beforeEach(() => {
  stub = supabaseStub();
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.functions.admin_dashboard_stats = () => ({ data: dashboardStats(), error: null });
  stub.state.functions.admin_usage_stats = () => ({ data: usageStats(), error: null });
  stub.state.functions.admin_income_stats = () => ({ data: incomeStats(), error: null });
  stub.state.tables.tenants = [
    {
      id: SHOP_A,
      is_demo: false, is_prospect: false,
      business_name: "Kut Shop",
      plan: "growth",
      status: "active",
      created_at: "2026-04-01T09:00:00Z",
      branding: { primary_color: "#0A7", logo_url: "https://cdn.example/kut.png" },
      store_config_rev: 65,
      wallet: [{ balance_iqd: "60000", total_topped_up_iqd: "100000" }],
    },
    {
      id: SHOP_B,
      is_demo: false, is_prospect: false,
      business_name: "New Shop",
      plan: "starter",
      status: "trial",
      created_at: "2026-11-12T09:00:00Z",
      branding: { logo_url: null, primary_color: "#3b82f6", secondary_color: "#8b5cf6" },
      store_config_rev: 0,
      wallet: null,
    },
  ];
  stub.state.tables.subscriptions = [];
  stub.state.tables.admin_activity_logs = [{ id: "log-1", action: "extend_trial" }];
  stub.state.tables.tenant_members = [
    { id: "m-1", tenant_id: SHOP_A, status: "active" },
    { id: "m-2", tenant_id: SHOP_A, status: "active" },
  ];
});

describe("GET /api/dashboard/v2", () => {
  it("reads totals the database counted, and never fetches order or ledger rows", async () => {
    const res = await call();
    expect(res.status).toBe(200);

    expect(stub.state.rpcCalls.map(({ fn }) => fn).sort()).toEqual([
      "admin_dashboard_stats",
      "admin_income_stats",
      "admin_usage_stats",
    ]);
    const read = stub.tablesRead();
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
    // Every shop starts with the same colours, so a colour without a logo is not branding.
    const fresh = body.onboarding.find((t: { tenantId: string }) => t.tenantId === SHOP_B);
    expect(fresh.completedSteps).not.toContain("has_branding");
    expect(body.walletHealth).toMatchObject({ healthy: 1, critical: 1 });
  });

  it("lists plan moves of real shops only: staff cancellations, every plan change on record, new shops", async () => {
    const recently = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    stub.state.tables.tenants.push({ ...quietShop(9), id: "demo-shop", is_demo: true, is_prospect: false, created_at: recently });
    // A shop opened two days ago is a new signup.
    stub.state.tables.tenants = stub.state.tables.tenants.map((t) => (t.id === SHOP_B ? { ...t, created_at: recently } : t));
    stub.state.tables.subscriptions = [
      { id: "s-1", tenant_id: SHOP_A, plan: "growth", status: "active", pending_plan: "starter" },
      // The demo store is in no platform number.
      { id: "s-3", tenant_id: "demo-shop", plan: "starter", status: "active", pending_plan: "growth" },
    ];
    stub.state.tables.admin_activity_logs = [
      { id: "log-c", action: "status_change", tenant_id: SHOP_B, details: { status: "cancelled" }, created_at: recently },
      { id: "log-d", action: "status_change", tenant_id: "demo-shop", details: { status: "cancelled" }, created_at: recently },
      // A staff plan change is on the plan record too: the log row is not read, so it is not counted twice.
      { id: "log-e", action: "plan_change", tenant_id: SHOP_A, details: { plan: "growth", previous_plan: "starter" }, created_at: recently },
      // Other steps are not read.
      { id: "log-f", action: "extend_trial", tenant_id: SHOP_B, details: { status: "cancelled" }, created_at: recently },
    ];
    // The merchant's own upgrade, which the staff log never had.
    stub.state.tables.subscription_plan_changes = [
      { id: 1, tenant_id: SHOP_A, from_plan: "starter", to_plan: "growth", changed_at: recently },
      { id: 2, tenant_id: "demo-shop", from_plan: "growth", to_plan: "starter", changed_at: recently },
    ];

    const body = await (await call()).json();

    expect(body.planMovements).toEqual([
      { fromPlan: "starter", toPlan: "cancelled", count: 1, type: "cancellation" },
      { fromPlan: "starter", toPlan: "growth", count: 1, type: "upgrade" },
      { fromPlan: "new", toPlan: "starter", count: 1, type: "new" },
      { fromPlan: "growth", toPlan: "starter", count: 1, type: "waiting" },
    ]);
    expect(stub.callsTo("admin_activity_logs.eq")).toContainEqual(["action", "status_change"]);
  });

  it("answers 500 when the database totals cannot be read", async () => {
    stub.state.functions.admin_dashboard_stats = () => ({ data: null, error: { message: "permission denied" } });
    const res = await call();
    expect(res.status).toBe(500);
    // The database's own message stays on the server.
    expect(await res.json()).toEqual({ error: "Failed to fetch dashboard data" });
  });

  it.each(["tenants", "subscriptions", "admin_activity_logs", "subscription_plan_changes", "tenant_members"])(
    "answers 500 when the %s query fails, instead of drawing the page without it",
    async (table) => {
      stub.state.failing.add(table);
      expect((await call()).status).toBe(500);
    },
  );

  it("counts every shop and every team member past the first 1,000 rows", async () => {
    const shops = Array.from({ length: SERVER_MAX_ROWS + 200 }, (_, i) => quietShop(i + 1));
    stub.state.tables.tenants = shops;
    // Three active members in each of the first 400 shops: 1,200 rows.
    stub.state.tables.tenant_members = shops.slice(0, 400).flatMap((shop, i) =>
      [0, 1, 2].map((k) => ({ id: `m-${i}-${k}`, tenant_id: shop.id, status: "active" })),
    );

    const body = await (await call()).json();

    expect(body.walletHealth.healthy).toBe(1_200);
    const withTeam = body.onboarding.filter((t: { completedSteps: string[] }) => t.completedSteps.includes("has_team"));
    expect(withTeam).toHaveLength(400);
    expect(stub.callsTo("tenants.order")).toContainEqual(["id", { ascending: true }]);
    expect(stub.callsTo("tenant_members.order")).toContainEqual(["id", { ascending: true }]);
  });
});
