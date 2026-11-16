import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { listStatsRow, supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The list read the orders, wallet lines and usage rows of the shops on the
 * page and counted them here. The API returns at most 1,000 rows, so a busy
 * page showed too few orders with no sign of it, days were cut on the server's
 * clock, and a failed read drew zeros. The numbers now come from one database
 * function, and a read that fails says so.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (params = "") => GET(new NextRequest(`http://admin.test/api/merchants?${params}`));

const shop = (n: number, extra: Row = {}): Row => ({
  id: `shop-${n}`,
  business_name: `Shop ${n}`,
  status: "active",
  plan: "starter",
  trial_ends_at: null,
  tags: null,
  wallet: { balance_iqd: 20000 },
  subscriptions: [],
  ...extra,
});

/** The database function answers for every shop asked for, with these rows where given. */
function answerStats(rows: Row[] = []) {
  stub.state.functions.admin_merchant_list_stats = (args) => ({
    data: (args._tenant_ids as string[]).map((id) => rows.find((row) => row.tenant_id === id) ?? listStatsRow(id)),
    error: null,
  });
}

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.tenants = [shop(1), shop(2)];
  answerStats();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/merchants", () => {
  it("takes each shop's numbers from the database, not from rows counted here", async () => {
    answerStats([
      listStatsRow("shop-1", {
        orders_30d: 1203,
        fees_30d: 9085,
        fees_today: 55,
        last_order_at: "2026-11-15T21:30:00+00:00",
        last_wallet_at: "2026-11-16T05:30:00+00:00",
        usage_orders_count: 1203,
        usage_orders_charged: 1100,
        usage_team_members_count: 3,
      }),
    ]);

    const { merchants, total } = await (await call()).json();

    expect(stub.state.rpcCalls).toEqual([
      { fn: "admin_merchant_list_stats", args: { _tenant_ids: ["shop-1", "shop-2"] } },
    ]);
    expect(stub.tablesRead()).toEqual(["tenants", "admin_notes"]);
    expect(total).toBe(2);
    expect(merchants[0]).toMatchObject({
      id: "shop-1",
      orders_30d: 1203,
      monthly_revenue: 9085,
      daily_revenue: 55,
      last_active_at: "2026-11-16T05:30:00+00:00",
      usage: { orders_count: 1203, orders_charged: 1100, team_members_count: 3 },
      billing_lock: null,
      tags: [],
    });
    expect(merchants[1]).toMatchObject({ orders_30d: 0, monthly_revenue: 0, last_active_at: null, usage: null });
  });

  it("uses the last order as last activity when it is later than the last wallet line, whatever the time zone it is written in", async () => {
    answerStats([
      listStatsRow("shop-1", {
        // 09:00 in Baghdad is 06:00 UTC: later than 05:30 UTC, though "09" sorts after "05" either way.
        last_order_at: "2026-11-16T09:00:00+03:00",
        last_wallet_at: "2026-11-16T05:30:00+00:00",
      }),
      listStatsRow("shop-2", {
        // 07:00 in Baghdad is 04:00 UTC: earlier than 05:30 UTC, though "07" sorts after "05".
        last_order_at: "2026-11-16T07:00:00+03:00",
        last_wallet_at: "2026-11-16T05:30:00+00:00",
      }),
    ]);

    const { merchants } = await (await call()).json();

    expect(merchants[0].last_active_at).toBe("2026-11-16T09:00:00+03:00");
    expect(merchants[1].last_active_at).toBe("2026-11-16T05:30:00+00:00");
  });

  it("reports a locked shop as locked, though its status still reads trial", async () => {
    stub.state.tables.tenants = [shop(1, { status: "trial" }), shop(2)];
    answerStats([listStatsRow("shop-1", { lock_reason: "trial_ended", lock_since: "2026-11-15T18:36:00+00:00" })]);

    const { merchants } = await (await call()).json();

    expect(merchants[0].billing_lock).toEqual({ reason: "trial_ended", since: "2026-11-15T18:36:00+00:00" });
    expect(merchants[1].billing_lock).toBeNull();
  });

  it("sends the 30-day line only when it is asked for", async () => {
    const line = Array.from({ length: 30 }, (_, day) => day);
    answerStats([listStatsRow("shop-1", { order_sparkline: line })]);

    expect((await (await call()).json()).merchants[0].order_sparkline).toEqual([]);
    expect((await (await call("include_sparkline=true")).json()).merchants[0].order_sparkline).toEqual(line);
  });

  it("answers with an error when the numbers cannot be read, not with zeros", async () => {
    stub.state.functions.admin_merchant_list_stats = () => ({ data: null, error: { message: "statement timeout" } });

    const response = await call();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to fetch merchants" });
  });

  it("answers with an error when the database leaves a shop out", async () => {
    stub.state.functions.admin_merchant_list_stats = () => ({ data: [listStatsRow("shop-1")], error: null });

    expect((await call()).status).toBe(500);
  });

  it("answers with an error when the pinned notes cannot be read", async () => {
    stub.state.failing.add("admin_notes");

    expect((await call()).status).toBe(500);
  });

  it("shows the newest pinned note of a shop", async () => {
    // The route asks for the newest first.
    stub.state.tables.admin_notes = [
      { tenant_id: "shop-1", content: "Pays in cash", updated_at: "2026-11-16T08:00:00Z", admin_label: "Zainab", is_pinned: true },
      { tenant_id: "shop-1", content: "Old note", updated_at: "2026-11-01T08:00:00Z", admin_label: null, is_pinned: true },
    ];

    const { merchants } = await (await call()).json();

    expect(merchants[0].pinned_note).toEqual({ content: "Pays in cash", updated_at: "2026-11-16T08:00:00Z", admin_label: "Zainab" });
    expect(merchants[1].pinned_note).toBeNull();
    expect(stub.callsTo("admin_notes.order")).toEqual([["updated_at", { ascending: false }]]);
  });

  it("keeps shops made in the same instant in a fixed order between pages", async () => {
    await call("sort=created_at:desc");

    expect(stub.callsTo("tenants.order")).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("finds a shop by its number as well as by name, slug and email", async () => {
    await call("search=%23100095");

    expect(stub.callsTo("tenants.or")).toEqual([
      ['business_name.ilike."%#100095%",slug.ilike."%#100095%",contact_email.ilike."%#100095%",merchant_code.ilike."%100095%"'],
    ]);
  });

  it("answers a search by shop number, which the API must be able to read", async () => {
    stub.state.tables.tenants = [shop(1)];

    const response = await call("search=95");

    expect(response.status).toBe(200);
    expect(stub.callsTo("tenants.or")[0]?.[0]).toContain('merchant_code.ilike."%95%"');
  });

  describe("the Needs attention filter", () => {
    it("looks at every shop, past the first 1,000", async () => {
      stub.state.tables.tenants = Array.from({ length: 1200 }, (_, n) => shop(n, n === 1150 ? { status: "suspended" } : {}));

      const { merchants, total } = await (await call("status=attention")).json();

      expect(stub.callsTo("tenants.range").slice(0, 3)).toEqual([
        [0, 999],
        [1000, 1999],
        [1200, 2199],
      ]);
      expect(stub.callsTo("tenants.in")).toEqual([["id", ["shop-1150"]]]);
      expect(total).toBe(1);
      expect(merchants.map((m: Row) => m.id)).toEqual(["shop-1150"]);
    });

    it("answers with an error when the shops cannot be read, not with an empty list", async () => {
      stub.state.failing.add("tenants");

      expect((await call("status=attention")).status).toBe(500);
    });

    it("counts a suspended shop, a trial ending within 3 days and a wallet under 5,000", async () => {
      const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      stub.state.tables.tenants = [
        shop(1),
        shop(2, { status: "suspended" }),
        shop(3, { status: "trial", trial_ends_at: inDays(2) }),
        shop(4, { status: "trial", trial_ends_at: inDays(6) }),
        shop(5, { wallet: { balance_iqd: 4999 } }),
        shop(6, { status: "cancelled", wallet: { balance_iqd: 0 } }),
      ];

      await call("status=attention");

      expect(stub.callsTo("tenants.in")).toEqual([["id", ["shop-2", "shop-3", "shop-5", "shop-6"]]]);
    });
  });
});
