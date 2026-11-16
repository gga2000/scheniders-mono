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
  is_demo: false,
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
  it("leaves the demo store out of every count (Fermi B13)", async () => {
    stub.state.tables.tenants = [shop(1), shop(2, { is_demo: true, wallet: { balance_iqd: 500000 } })];

    const stats = await (await call()).json();

    expect(stats.total).toBe(1);
    expect(stats.total_wallet_iqd).toBe(20000);
    expect(stats.plan_prices_iqd).toBe(9000);
    expect(stub.callsTo("tenants.eq")).toContainEqual(["is_demo", false]);
  });

  it("counts every shop when there are more than one page of them", async () => {
    stub.state.tables.tenants = Array.from({ length: 1200 }, (_, n) => shop(n));

    const stats = await (await call()).json();

    expect(stats.total).toBe(1200);
    expect(stats.status.active).toBe(1200);
    expect(stats.total_wallet_iqd).toBe(1200 * 20000);
    expect(stats.plan_prices_iqd).toBe(1200 * 9000);
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

    expect(stats.fees_30d_iqd).toBe(23870);
    expect(stub.state.rpcCalls).toHaveLength(1);
    expect(stub.state.rpcCalls[0].fn).toBe("admin_fees_30d");
    expect(stub.state.rpcCalls[0].args._tenant_ids).toHaveLength(1200);
    expect(stub.tablesRead()).toEqual(["tenants", "plan_limits"]);
  });

  it("asks for the fees of the shops left after the balance filter only", async () => {
    stub.state.tables.tenants = [
      shop(1, { wallet: { balance_iqd: 4000 }, staff_wallet_balance: 4000 }),
      shop(2, { staff_wallet_balance: 20000 }),
      shop(3, { wallet: [], staff_wallet_balance: 0 }),
    ];

    const stats = await (await call("balance=critical")).json();

    // Every page of the read carries the filter (here: the page of shops, then the empty one that ends it).
    expect(stub.callsTo("tenants.filter")).toEqual(new Array(2).fill(["staff_wallet_balance", "lt", 10000]));
    expect(stats.total).toBe(2);
    expect(stub.state.rpcCalls[0].args).toEqual({ _tenant_ids: ["shop-1", "shop-3"] });
  });

  it("counts the shops of a health band, as the list does", async () => {
    stub.state.tables.tenants = [shop(1, { staff_health_score: 20 }), shop(2, { staff_health_score: 95 })];

    const stats = await (await call("health=at_risk")).json();

    expect(stats.total).toBe(1);
    expect(stub.state.rpcCalls[0].args).toEqual({ _tenant_ids: ["shop-1"] });
  });

  it("takes \"needs attention\" from the database, so a locked shop with a full wallet counts", async () => {
    stub.state.tables.tenants = [
      // Paying, 80,000 IQD, month unpaid: no status, date or balance rule here sees it.
      shop(1, { wallet: { balance_iqd: 80000 }, staff_needs_attention: true }),
      shop(2, { staff_needs_attention: false }),
      shop(3, { status: "suspended", staff_needs_attention: true }),
    ];

    const stats = await (await call()).json();

    expect(stub.callsTo("tenants.select")[0]?.[0]).toContain("staff_needs_attention");
    expect(stats.buckets).toEqual({
      trials_today: 0,
      trials_expired: 0,
      suspended: 1,
      cancelled: 0,
      low_wallet: 0,
      attention: 2,
    });
  });

  it("counts one shop with two reasons once, and a low wallet from under 5,000 IQD", async () => {
    stub.state.tables.tenants = [
      // Trial ended and wallet empty: two reasons, one shop.
      shop(1, {
        status: "trial",
        trial_ends_at: "2020-01-01T00:00:00Z",
        wallet: { balance_iqd: 0 },
        staff_needs_attention: true,
      }),
      // 7,000 IQD is in the "critical" balance band (under 10,000) and not on the attention list.
      shop(2, { wallet: { balance_iqd: 7000 }, staff_needs_attention: false }),
      shop(3, { wallet: { balance_iqd: 5000 }, staff_needs_attention: false }),
    ];

    const { buckets } = await (await call()).json();

    expect(buckets.attention).toBe(1);
    expect(buckets.trials_expired).toBe(1);
    expect(buckets.low_wallet).toBe(1);
  });

  it("says a trial ends today only when it ends on today's Baghdad date", async () => {
    // 22:00 Baghdad on 16 Nov. Shop 1 ends at 06:21 tomorrow: 8 hours away,
    // but tomorrow. Shop 2 ends at 23:30 tonight. Shop 3 ended at 21:00.
    vi.useFakeTimers({ now: Date.parse("2026-11-16T22:00:00+03:00"), toFake: ["Date"] });
    try {
      stub.state.tables.tenants = [
        shop(1, { status: "trial", trial_ends_at: "2026-11-17T03:21:00Z" }),
        shop(2, { status: "trial", trial_ends_at: "2026-11-16T20:30:00Z" }),
        shop(3, { status: "trial", trial_ends_at: "2026-11-16T18:00:00Z" }),
      ];

      const { buckets } = await (await call()).json();

      expect(buckets.trials_today).toBe(1);
      expect(buckets.trials_expired).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts sign-ups on whole Baghdad days, the last day included", async () => {
    await call("date_from=2026-11-16&date_to=2026-11-16");

    // Every page of shops carries both bounds.
    const pages = stub.callsTo("tenants.range").length;
    expect(pages).toBeGreaterThan(0);
    expect(stub.callsTo("tenants.gte")).toEqual(Array(pages).fill(["created_at", "2026-11-16T00:00:00+03:00"]));
    expect(stub.callsTo("tenants.lt")).toEqual(Array(pages).fill(["created_at", "2026-11-17T00:00:00+03:00"]));
  });

  it("refuses a sign-up day that is not a day, and reads nothing", async () => {
    const res = await call("date_to=16-11-2026");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "date_to must be a day such as 2026-11-16" });
    expect(stub.state.calls).toEqual([]);
  });

  it("never reads \"attention\" as a status", async () => {
    const stats = await (await call("status=attention")).json();

    expect(stub.callsTo("tenants.eq").filter(([column]) => column === "status")).toEqual([]);
    expect(stub.callsTo("tenants.filter")).toEqual([]);
    expect(stats.total).toBe(2);
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
    expect(stats.fees_30d_iqd).toBe(0);
    expect(stub.state.rpcCalls).toEqual([]);
  });

  it("searches the way the list does, shop number included", async () => {
    const response = await call("search=100095");

    expect(response.status).toBe(200);
    expect(stub.callsTo("tenants.or")[0]).toEqual([
      'business_name.ilike."%100095%",slug.ilike."%100095%",contact_email.ilike."%100095%",contact_phone.ilike."%100095%",merchant_code.ilike."%100095%"',
    ]);
  });
});
