import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { listStatsRow, supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The Merchants list is one table (board s1). The API takes a tab, a search
 * and a sort, applies them in the database over every shop, and sends only
 * what the table shows. Orders, the last order and the lock come from one
 * database function, and a read that fails says so instead of drawing zeros.
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
  display_id: 100000 + n,
  is_demo: false,
  business_name: `Shop ${n}`,
  slug: `shop-${n}`,
  city: "Baghdad",
  contact_phone: null,
  status: "active",
  plan: "starter",
  trial_ends_at: null,
  restrictions: null,
  staff_wallet_balance: 20000,
  staff_locked: false,
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
  it("sends each shop as the table shows it, with the database's numbers", async () => {
    answerStats([listStatsRow("shop-1", { orders_30d: 1203, last_order_at: "2026-11-15T21:30:00+00:00" })]);
    stub.state.tables.tenants = [shop(1, { contact_phone: "07701234567", staff_wallet_balance: "43800" })];

    const body = await (await call()).json();

    expect(body.total).toBe(1);
    expect(body.merchants).toEqual([
      {
        id: "shop-1",
        display_id: 100001,
        business_name: "Shop 1",
        slug: "shop-1",
        city: "Baghdad",
        contact_phone: "07701234567",
        status: "active",
        plan: "starter",
        trial_ends_at: null,
        restrictions: null,
        wallet_iqd: 43800,
        subscription: null,
        billing_lock: null,
        orders_30d: 1203,
        last_order_at: "2026-11-15T21:30:00+00:00",
      },
    ]);
  });

  it("leaves the demo store out", async () => {
    stub.state.tables.tenants = [shop(1), shop(2, { is_demo: true })];
    const body = await (await call()).json();
    expect(body.merchants.map((m: Row) => m.id)).toEqual(["shop-1"]);
  });

  it("reports a locked shop as locked, though its status still reads trial", async () => {
    stub.state.tables.tenants = [shop(1, { status: "trial" })];
    answerStats([listStatsRow("shop-1", { lock_reason: "trial_ended", lock_since: "2026-11-15T06:21:00+00:00" })]);
    const body = await (await call()).json();
    expect(body.merchants[0].billing_lock).toEqual({ reason: "trial_ended", since: "2026-11-15T06:21:00+00:00" });
  });

  it("takes the subscription that runs latest when a shop has an old one too", async () => {
    stub.state.tables.tenants = [
      shop(1, {
        subscriptions: [
          { status: "cancelled", current_period_end: "2026-10-01T00:00:00+00:00", auto_renew: false },
          { status: "active", current_period_end: "2026-12-01T00:00:00+00:00", auto_renew: true },
        ],
      }),
    ];
    const body = await (await call()).json();
    expect(body.merchants[0].subscription).toEqual({ status: "active", current_period_end: "2026-12-01T00:00:00+00:00", auto_renew: true });
  });

  it("answers with an error when the numbers cannot be read, not with zeros", async () => {
    stub.state.functions.admin_merchant_list_stats = () => ({ data: null, error: { message: "timeout" } });
    expect((await call()).status).toBe(500);
  });

  it("answers with an error when the database leaves a shop out", async () => {
    stub.state.functions.admin_merchant_list_stats = () => ({ data: [listStatsRow("shop-1")], error: null });
    expect((await call()).status).toBe(500);
  });

  it("answers with an error when the shops cannot be read, not with an empty list", async () => {
    stub.state.failing.add("tenants");
    expect((await call()).status).toBe(500);
  });

  describe("tabs", () => {
    beforeEach(() => {
      stub.state.tables.tenants = [
        shop(1, { status: "trial" }),
        shop(2, { status: "active" }),
        shop(3, { status: "active", plan: "internal" }),
        shop(4, { status: "suspended" }),
        shop(5, { status: "limited" }),
        shop(6, { status: "cancelled" }),
        shop(7, { status: "active", staff_locked: true }),
      ];
    });
    const ids = async (tab: string) => ((await (await call(`tab=${tab}`)).json()).merchants as Row[]).map((m) => m.id);

    it("lists every shop on All", async () => {
      expect(await ids("all")).toHaveLength(7);
    });

    it("lists the shops the database counts as locked on Locked, and keeps them on their own tab too", async () => {
      expect(await ids("locked")).toEqual(["shop-7"]);
      expect(stub.callsTo("tenants.filter")).toContainEqual(["staff_locked", "is", "true"]);
      expect(await ids("paying")).toContain("shop-7");
    });

    it("keeps our own shops out of Paying: they are never billed", async () => {
      expect(await ids("paying")).toEqual(["shop-2", "shop-7"]);
      expect(await ids("internal")).toEqual(["shop-3"]);
    });

    it("puts shops on hold and paused shops under On hold", async () => {
      expect(await ids("stopped")).toEqual(["shop-4", "shop-5"]);
    });

    it("lists trials and cancelled shops on their own tabs", async () => {
      expect(await ids("trial")).toEqual(["shop-1"]);
      expect(await ids("cancelled")).toEqual(["shop-6"]);
    });

    it("answers 400 for a tab that does not exist, without reading", async () => {
      const response = await call("tab=attention");
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'There is no "attention" tab' });
      expect(stub.tablesRead()).toEqual([]);
    });
  });

  describe("sort", () => {
    it("lists the newest shops first when no sort is asked for", async () => {
      await call();
      expect(stub.callsTo("tenants.order")).toEqual([
        ["created_at", { ascending: false, nullsFirst: false }],
        ["id", { ascending: true }],
      ]);
    });

    it("sorts by the wallet over every shop, in the database", async () => {
      await call("sort=wallet:asc");
      expect(stub.callsTo("tenants.order")[0]).toEqual(["staff_wallet_balance", { ascending: true, nullsFirst: false }]);
    });

    it("answers 400 with plain words for a sort it does not know, without reading", async () => {
      const response = await call("sort=health:desc");
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'The list cannot be sorted by "health:desc"' });
      expect(stub.tablesRead()).toEqual([]);
    });
  });

  it("finds a shop by its number as well as by name, slug, email and phone", async () => {
    await call("search=%23100095");
    expect(stub.callsTo("tenants.or")).toEqual([
      [
        'business_name.ilike."%#100095%",slug.ilike."%#100095%",contact_email.ilike."%#100095%",contact_phone.ilike."%#100095%",merchant_code.ilike."%100095%"',
      ],
    ]);
  });

  it("reads 50 shops a page and says how many there are in all", async () => {
    stub.state.tables.tenants = Array.from({ length: 120 }, (_, n) => shop(n + 1));
    const body = await (await call("page=3")).json();
    expect(body).toMatchObject({ total: 120, page: 3, limit: 50 });
    expect(body.merchants).toHaveLength(20);
    expect(stub.callsTo("tenants.range")).toEqual([[100, 149]]);
  });
});
