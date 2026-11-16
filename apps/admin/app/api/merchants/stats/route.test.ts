import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The numbers above the Merchants list were added up from one request for
 * every shop and one for 30 days of charges. The API returns at most 1,000
 * rows of each, so past that the totals were short with no sign of it, and a
 * failed read of the charges showed 0 IQD.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (params = "") => GET(new NextRequest(`http://admin.test/api/merchants/stats?${params}`));

const shop = (n: number, extra: Row = {}): Row => ({
  id: `shop-${n}`,
  status: "active",
  plan: "starter",
  trial_ends_at: null,
  wallet: { balance_iqd: 20000 },
  ...extra,
});

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.tenants = [shop(1), shop(2)];
  stub.state.tables.plan_limits = [{ plan: "starter", base_price_iqd: 9000 }];
  stub.state.functions.admin_fees_30d = () => ({ data: 23870, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/merchants/stats", () => {
  it("counts every shop when there are more than one page of them", async () => {
    stub.state.tables.tenants = Array.from({ length: 1200 }, (_, n) => shop(n));

    const stats = await (await call()).json();

    expect(stats.total).toBe(1200);
    expect(stats.status.active).toBe(1200);
    expect(stats.total_wallet_iqd).toBe(1200 * 20000);
    expect(stats.subscription_mrr_iqd).toBe(1200 * 9000);
    expect(stub.callsTo("tenants.range")).toEqual([
      [0, 999],
      [1000, 1999],
      [1200, 2199],
    ]);
    // Every page repeats the same sort key, so no shop is skipped or repeated between pages.
    expect(stub.callsTo("tenants.order")).toEqual(new Array(3).fill(["id", { ascending: true }]));
  });

  it("has the database add up the fees of all the shops, as one number", async () => {
    stub.state.tables.tenants = Array.from({ length: 1200 }, (_, n) => shop(n));

    const stats = await (await call()).json();

    expect(stats.usage_charges_30d_iqd).toBe(23870);
    expect(stub.state.rpcCalls).toHaveLength(1);
    expect(stub.state.rpcCalls[0].fn).toBe("admin_fees_30d");
    expect(stub.state.rpcCalls[0].args._tenant_ids).toHaveLength(1200);
    expect(stub.tablesRead()).toEqual(["tenants", "plan_limits"]);
  });

  it("asks for the fees of the shops left after the balance filter only", async () => {
    stub.state.tables.tenants = [shop(1, { wallet: { balance_iqd: 4000 } }), shop(2), shop(3, { wallet: [] })];

    const stats = await (await call("balance=critical")).json();

    expect(stats.total).toBe(2);
    expect(stub.state.rpcCalls[0].args).toEqual({ _tenant_ids: ["shop-1", "shop-3"] });
  });

  it("answers with an error when the fees cannot be read, not with 0 IQD", async () => {
    stub.state.functions.admin_fees_30d = () => ({ data: null, error: { message: "statement timeout" } });

    const response = await call();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to compute merchant stats" });
  });

  it("answers with an error when a page of shops fails, not with a short count", async () => {
    stub.state.failing.add("tenants");

    expect((await call()).status).toBe(500);
  });

  it("answers with zeros, and asks the database nothing, when no shop matches", async () => {
    stub.state.tables.tenants = [];

    const stats = await (await call("city=Basra")).json();

    expect(stats.total).toBe(0);
    expect(stats.usage_charges_30d_iqd).toBe(0);
    expect(stub.state.rpcCalls).toEqual([]);
  });

  it("searches the way the list does, shop number included", async () => {
    const response = await call("search=100095");

    expect(response.status).toBe(200);
    expect(stub.callsTo("tenants.or")[0]).toEqual([
      'business_name.ilike."%100095%",slug.ilike."%100095%",contact_email.ilike."%100095%",merchant_code.ilike."%100095%"',
    ]);
  });
});
