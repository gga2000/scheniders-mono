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
  is_demo: false, is_prospect: false,
  business_name: `Shop ${n}`,
  status: "active",
  plan: "starter",
  trial_ends_at: null,
  staff_shop_tags: null,
  wallet: { balance_iqd: 20000 },
  subscriptions: [],
  staff_health_parts: { status: 15, wallet: 5, orders: 0 },
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
        team_members: 7,
      }),
    ]);

    const { merchants, total } = await (await call()).json();

    expect(stub.state.rpcCalls).toEqual([
      { fn: "admin_merchant_list_stats", args: { _tenant_ids: ["shop-1", "shop-2"] } },
    ]);
    expect(stub.tablesRead()).toEqual(["tenants", "admin_notes", "subscriptions"]);
    expect(total).toBe(2);
    expect(merchants[0]).toMatchObject({
      id: "shop-1",
      orders_30d: 1203,
      fees_30d: 9085,
      fees_today: 55,
      last_active_at: "2026-11-16T05:30:00+00:00",
      usage: { orders_count: 1203, orders_charged: 1100, team_members_count: 3 },
      // The team is the shop's active members today, not the usage row's number from sign-up.
      team_members: 7,
      billing_lock: null,
      tags: [],
    });
    expect(merchants[1]).toMatchObject({ orders_30d: 0, fees_30d: 0, last_active_at: null, usage: null });
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

  it("sends the health parts as the database worked them out, and the score as their sum", async () => {
    // The browser used to work the score out itself, in five places. A paused
    // shop with an empty wallet would be 20 by that sum: the row's parts must come through.
    stub.state.tables.tenants = [
      shop(1, {
        status: "suspended",
        wallet: { balance_iqd: 0 },
        staff_health_parts: { status: 15, wallet: 5, orders: 5 },
      }),
    ];

    const { merchants } = await (await call()).json();

    // The score calls the parts, so reading both worked the parts out twice per row.
    const columns = stub.callsTo("tenants.select")[0]?.[0];
    expect(columns).toMatch(/, staff_health_parts$/);
    expect(columns).not.toMatch(/staff_health_score/);
    expect(merchants[0]).toMatchObject({
      staff_health_score: 75,
      staff_health_parts: { status: 15, wallet: 5, orders: 5 },
    });
  });

  it("fails rather than show a made-up score when the parts are not numbers", async () => {
    stub.state.tables.tenants = [shop(1, { staff_health_parts: { status: "15", wallet: 5 } })];
    expect((await call()).status).toBe(500);
  });

  it("reads only the columns the list shows, never the store builder's pages", async () => {
    // With "*" every shop on the page came with its store_config, drafts and
    // v2 copies: 222 KB for two shops, read by no screen.
    stub.state.tables.tenants = [shop(1)];
    await call();

    const columns = String(stub.callsTo("tenants.select")[0]?.[0]);
    expect(columns).not.toMatch(/\*|store_config|metadata|subscriptions/);
    expect(columns).toContain("wallet(balance_iqd, threshold_iqd, total_charged_iqd, total_topped_up_iqd)");
  });

  it("sends the staff tags from staff_shop_tags, and none for a shop never tagged", async () => {
    // The tags used to be read from tenants.tags, a column that never existed.
    stub.state.tables.tenants = [shop(1, { staff_shop_tags: { tags: ["VIP", "At Risk"] } }), shop(2)];

    const { merchants } = await (await call()).json();

    expect(merchants[0].tags).toEqual(["VIP", "At Risk"]);
    expect(merchants[1].tags).toEqual([]);
    expect(merchants[0]).not.toHaveProperty("staff_shop_tags");
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

  /*
   * Round 7: the card's menu offered free days only to a shop on trial. A
   * paying shop gets free days on its month (lib/shop-actions), so the card
   * needs to know whether that month is running, read the way the billing
   * lock reads it: the newest subscription.
   */
  it("says whether each shop's newest subscription is running", async () => {
    stub.state.tables.subscriptions = [
      { tenant_id: "shop-1", status: "cancelled", created_at: "2026-11-10T08:00:00Z" },
      { tenant_id: "shop-1", status: "active", created_at: "2026-10-01T08:00:00Z" },
      { tenant_id: "shop-2", status: "past_due", created_at: "2026-11-01T08:00:00Z" },
    ];

    const { merchants } = await (await call()).json();

    expect(stub.callsTo("subscriptions.order")).toEqual([["created_at", { ascending: false }]]);
    expect(merchants.map((m: Row) => [m.id, m.subscription_running])).toEqual([
      ["shop-1", false],
      ["shop-2", true],
    ]);
  });

  it("says no subscription is running for a shop with none", async () => {
    const { merchants } = await (await call()).json();

    expect(merchants.map((m: Row) => m.subscription_running)).toEqual([false, false]);
  });

  it("answers with an error when the subscriptions cannot be read", async () => {
    stub.state.failing.add("subscriptions");

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

  describe("sort", () => {
    it("orders on the database's column for the header pressed, empty values last", async () => {
      expect((await call("sort=balance:desc,business:asc")).status).toBe(200);
      expect(stub.callsTo("tenants.order")).toEqual([
        ["wallet(balance_iqd)", { ascending: false, nullsFirst: false }],
        ["business_name", { ascending: true, nullsFirst: false }],
        // The tie-break, so a page boundary cannot skip or repeat a shop.
        ["id", { ascending: true }],
      ]);
    });

    it("lists the newest shops first when no sort is asked for", async () => {
      await call();
      expect(stub.callsTo("tenants.order")[0]).toEqual(["created_at", { ascending: false, nullsFirst: false }]);
    });

    it("answers 400 with plain words for a column it cannot sort by, without reading", async () => {
      const response = await call("sort=revenue:desc");
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'The list cannot be sorted by "revenue"' });
      expect(stub.tablesRead()).toEqual([]);
    });
  });

  describe("ids", () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const B = "22222222-2222-4222-8222-222222222222";
    const C = "33333333-3333-4333-8333-333333333333";

    it("sends only the shops asked for, with the list's own numbers", async () => {
      stub.state.tables.tenants = [shop(1, { id: A }), shop(2, { id: B }), shop(3, { id: C })];
      answerStats([listStatsRow(C, { orders_30d: 12, fees_30d: 660, team_members: 2 })]);

      const { merchants } = await (await call(`ids=${C},${A}`)).json();

      expect(stub.callsTo("tenants.in")).toEqual([["id", [C, A]]]);
      expect(merchants.map((m: { id: string }) => m.id).sort()).toEqual([A, C]);
      expect(merchants.find((m: { id: string }) => m.id === C)).toMatchObject({
        orders_30d: 12,
        fees_30d: 660,
        team_members: 2,
      });
    });

    it("refuses a value that is not a shop id, and reads nothing", async () => {
      const response = await call("ids=1 or true");

      expect(response.status).toBe(400);
      expect(stub.tablesRead()).toEqual([]);
    });

    it("adds no filter when ids is not asked for", async () => {
      await call();

      expect(stub.callsTo("tenants.in")).toEqual([]);
    });
  });

  it("lists sign-ups on whole Baghdad days, so \"today\" holds today's shops", async () => {
    // The filter used to stop at midnight UTC on the last day: "today" was always empty.
    await call("date_from=2026-11-16&date_to=2026-11-16");

    expect(stub.callsTo("tenants.gte")).toEqual([["created_at", "2026-11-16T00:00:00+03:00"]]);
    expect(stub.callsTo("tenants.lt")).toEqual([["created_at", "2026-11-17T00:00:00+03:00"]]);
    expect(stub.callsTo("tenants.lte")).toEqual([]);
  });

  it("refuses a sign-up day that is not a day, and reads nothing", async () => {
    const res = await call("date_from=2026-02-30");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "date_from must be a day such as 2026-11-16" });
    expect(stub.state.calls).toEqual([]);
  });

  it("keeps shops made in the same instant in a fixed order between pages", async () => {
    await call("sort=created_at:desc");

    expect(stub.callsTo("tenants.order")).toEqual([
      ["created_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("finds a shop by its number as well as by name, slug, email and phone", async () => {
    await call("search=%23100095");

    expect(stub.callsTo("tenants.or")).toEqual([
      ['business_name.ilike."%#100095%",slug.ilike."%#100095%",contact_email.ilike."%#100095%",contact_phone.ilike."%#100095%",merchant_code.ilike."%100095%"'],
    ]);
  });

  it("answers a search by shop number, which the API must be able to read", async () => {
    stub.state.tables.tenants = [shop(1)];

    const response = await call("search=95");

    expect(response.status).toBe(200);
    expect(stub.callsTo("tenants.or")[0]?.[0]).toContain('merchant_code.ilike."%95%"');
  });

  /*
   * "Needs attention", the balance bands and the health bands are database
   * functions over the shop (migration staff_list_filters). The route used to
   * work them out here: attention from a list of ids, balance and health on
   * the page it had already cut, so a page of 50 could hold 3 shops under a
   * count of all of them.
   */
  describe("the filters the database works out", () => {
    it("asks the database which shops need attention, and counts only those", async () => {
      stub.state.tables.tenants = Array.from({ length: 1200 }, (_, n) =>
        shop(n, { staff_needs_attention: n === 1150 }),
      );

      const { merchants, total } = await (await call("status=attention")).json();

      expect(stub.callsTo("tenants.filter")).toEqual([["staff_needs_attention", "eq", true]]);
      // No list of ids is sent back to the database, and "attention" is never read as a status.
      expect(stub.callsTo("tenants.in")).toEqual([]);
      expect(stub.callsTo("tenants.match")).toEqual([[{ is_demo: false, is_prospect: false }]]);
      expect(stub.callsTo("tenants.eq")).toEqual([]);
      expect(total).toBe(1);
      expect(merchants.map((m: Row) => m.id)).toEqual(["shop-1150"]);
    });

    it("answers with an error when the shops cannot be read, not with an empty list", async () => {
      stub.state.failing.add("tenants");

      expect((await call("status=attention")).status).toBe(500);
    });

    it("filters by wallet balance before the list is cut into pages", async () => {
      // The one shop under 10,000 IQD is the 111th: the first page of 50 never held it.
      stub.state.tables.tenants = Array.from({ length: 120 }, (_, n) =>
        shop(n, { staff_wallet_balance: n === 110 ? 4000 : 20000 }),
      );

      const { merchants, total } = await (await call("balance=critical&limit=50")).json();

      expect(total).toBe(1);
      expect(merchants.map((m: Row) => m.id)).toEqual(["shop-110"]);
    });

    it("filters by health before the list is cut into pages", async () => {
      stub.state.tables.tenants = Array.from({ length: 120 }, (_, n) =>
        shop(n, { staff_health_score: n === 110 ? 20 : n === 111 ? 55 : 95 }),
      );

      const atRisk = await (await call("health=at_risk&limit=50")).json();
      expect([atRisk.total, atRisk.merchants.map((m: Row) => m.id)]).toEqual([1, ["shop-110"]]);

      const warning = await (await call("health=warning&limit=50")).json();
      expect([warning.total, warning.merchants.map((m: Row) => m.id)]).toEqual([1, ["shop-111"]]);

      const healthy = await (await call("health=healthy&limit=50")).json();
      expect([healthy.total, healthy.merchants.length]).toEqual([118, 50]);
    });

    it("puts the status, the balance band and the health band on one read", async () => {
      await call("status=trial&balance=low&health=healthy");

      expect(stub.callsTo("tenants.match")).toEqual([[{ is_demo: false, is_prospect: false }]]);
      expect(stub.callsTo("tenants.eq")).toEqual([["status", "trial"]]);
      expect(stub.callsTo("tenants.filter")).toEqual([
        ["staff_wallet_balance", "gte", 10000],
        ["staff_wallet_balance", "lte", 50000],
        ["staff_health_score", "gte", 70],
      ]);
    });
  });
});

describe("GET /api/merchants city filter", () => {
  it("finds a city however the merchant typed it", async () => {
    stub.state.tables.tenants = [
      shop(1, { city: "بغداد" }),
      shop(2, { city: "Baghdad" }),
      shop(3, { city: " baghdad" }),
      shop(4, { city: "البصرة" }),
      shop(5, { city: null }),
    ];

    const { merchants, total } = await (await call("city=baghdad")).json();

    expect(merchants.map((m: Row) => m.id)).toEqual(["shop-1", "shop-2", "shop-3"]);
    expect(total).toBe(3);
  });

  it("refuses a city the picker does not offer, before any read", async () => {
    const res = await call("city=atlantis");

    expect(res.status).toBe(400);
    expect(stub.tablesRead()).toEqual([]);
  });
});
