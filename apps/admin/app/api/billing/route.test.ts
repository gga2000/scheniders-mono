import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SERVER_MAX_ROWS, supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * Billing read every wallet and every shop in two unordered reads of at most
 * 1,000 rows each and joined them here. Past 1,000 shops, wallets dropped out
 * and the totals at the top were short, with no sign of it.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/billing"));

const shop = (n: number, wallet: Row | null = { balance_iqd: 10_000, threshold_iqd: 5_000, total_charged_iqd: 2_000, total_topped_up_iqd: 12_000 }): Row => ({
  id: `shop-${String(n).padStart(5, "0")}`,
  is_demo: false, is_prospect: false,
  business_name: `Shop ${n}`,
  plan: "starter",
  status: "active",
  wallet,
});

beforeEach(() => {
  stub = supabaseStub();
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.tables.tenants = [shop(1), shop(2, null)];
  stub.state.tables.wallet_transactions = [];
});

describe("GET /api/billing", () => {
  it("adds up every wallet past the first 1,000 shops", async () => {
    stub.state.tables.tenants = Array.from({ length: SERVER_MAX_ROWS + 300 }, (_, i) => shop(i + 1));

    const body = await (await call()).json();

    expect(body.wallets).toHaveLength(1_300);
    expect(body.summary).toEqual({
      totalBalance: 13_000_000,
      totalCharged: 2_600_000,
      totalToppedUp: 15_600_000,
      lowBalanceCount: 0,
    });
    expect(stub.callsTo("tenants.order")).toContainEqual(["id", { ascending: true }]);
  });

  it("names each wallet by its shop, and leaves out a shop with no wallet yet", async () => {
    const body = await (await call()).json();

    expect(body.wallets).toEqual([
      {
        tenant_id: "shop-00001",
        business_name: "Shop 1",
        plan: "starter",
        status: "active",
        balance_iqd: 10_000,
        threshold_iqd: 5_000,
        total_charged_iqd: 2_000,
        total_topped_up_iqd: 12_000,
      },
    ]);
  });

  it("leaves the demo store's wallet and ledger out (Fermi B13)", async () => {
    stub.state.tables.tenants = [shop(1), { ...shop(2), is_demo: true, is_prospect: false }];
    stub.state.tables.wallet_transactions = [
      { id: "t-1", amount_iqd: -55, tenants: { business_name: "Shop 1", is_demo: false, is_prospect: false } },
      { id: "t-2", amount_iqd: -9_000, tenants: { business_name: "Fermi B13", is_demo: true, is_prospect: false } },
    ];

    const body = await (await call()).json();

    expect(body.wallets.map((w: { tenant_id: string }) => w.tenant_id)).toEqual(["shop-00001"]);
    expect(body.recentTransactions.map((t: { id: string }) => t.id)).toEqual(["t-1"]);
  });

  it.each(["tenants", "wallet_transactions"])("answers 500 when the %s read fails, not with short totals", async (table) => {
    stub.state.failing.add(table);
    expect((await call()).status).toBe(500);
  });
});
