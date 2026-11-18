import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SERVER_MAX_ROWS, supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * Trials read the shops on trial in one request of at most 1,000 rows, then
 * their wallets by a list of every id. Past 1,000 trials the list was short,
 * and the id list makes a URL too long for the API. The wallet now comes with
 * the shop, a page at a time.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/trials"));

const NOW = Date.parse("2026-11-16T22:00:00+03:00");

const trial = (n: number, trialEndsAt: string, extra: Row = {}): Row => ({
  id: `shop-${String(n).padStart(5, "0")}`,
  is_demo: false, is_prospect: false,
  business_name: `Shop ${n}`,
  slug: `shop-${n}`,
  plan: "starter",
  status: "trial",
  trial_ends_at: trialEndsAt,
  city: "Kut",
  contact_email: null,
  created_at: "2026-11-10T09:00:00Z",
  wallet: [{ balance_iqd: 4_000 }],
  ...extra,
});

const facts = (id: string, extra: Row = {}): Row => ({
  tenant_id: id,
  created_at: "2026-11-10T09:00:00Z",
  owner_phone: "07701234567",
  orders: 0, delivered: 0, shipped: false,
  whatsapp_sent: 0, whatsapp_cap: 200,
  prime_linked: false,
  trial_check: null, trial_check_decision: null,
  lock_reason: null,
  last_call: null,
  ...extra,
});

beforeEach(() => {
  stub = supabaseStub();
  // Every shop on trial in the list has its follow-up facts.
  stub.state.functions.admin_trial_pipeline = () => ({
    data: (stub.state.tables.tenants ?? []).map((t) => facts(String(t.id))),
    error: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  return () => vi.useRealTimers();
});

describe("GET /api/trials", () => {
  it("lists every trial past the first 1,000 rows, each with its wallet", async () => {
    stub.state.tables.tenants = Array.from({ length: SERVER_MAX_ROWS + 250 }, (_, i) =>
      trial(i + 1, "2026-11-30T09:00:00Z"),
    );

    const body = await (await call()).json();

    expect(body.trials).toHaveLength(1_250);
    expect(body.summary).toEqual({ total: 1_250, expiringSoon: 0, expired: 0, healthy: 1_250 });
    expect(body.trials[1_249].balance_iqd).toBe(4_000);
    expect(stub.tablesRead()).toEqual(["tenants"]);
  });

  it("counts days on the Baghdad calendar, soonest end first, and leaves the demo store and prospect stores out", async () => {
    stub.state.tables.tenants = [
      trial(1, "2026-11-17T03:21:00Z"), // 06:21 tomorrow: 1 day left
      trial(2, "2026-11-16T20:30:00Z"), // 23:30 tonight: ends today
      trial(3, "2026-11-16T18:00:00Z", { wallet: null }), // 21:00: ended today
      trial(4, "2026-11-30T09:00:00Z", { is_demo: true, is_prospect: false }),
      // A store built for a lead before it signs up: its 30 days are no merchant's trial.
      trial(5, "2026-12-16T09:00:00Z", { is_demo: false, is_prospect: true }),
    ];

    const body = await (await call()).json();

    expect(body.trials.map((t: { days_remaining: number; is_expired: boolean; balance_iqd: number }) => [t.days_remaining, t.is_expired, t.balance_iqd])).toEqual([
      [0, true, 0],
      [0, false, 4_000],
      [1, false, 4_000],
    ]);
    expect(body.summary).toEqual({ total: 3, expiringSoon: 2, expired: 1, healthy: 0 });
    expect(body.trials[0]).not.toHaveProperty("wallet");
  });

  it("keeps a paused trial, marked paused, and leaves out every other paused or paying shop", async () => {
    stub.state.tables.tenants = [
      trial(1, "2026-11-18T09:00:00Z"),
      // Paused while on trial: its days run on, and it locks at their end.
      trial(2, "2026-11-17T09:00:00Z", { status: "limited", restrictions: { status_before: "trial", paused_until: "2026-11-20T09:00:00Z" } }),
      trial(3, "2026-11-30T09:00:00Z", { status: "limited", restrictions: { status_before: "active" } }),
      trial(4, "2026-11-30T09:00:00Z", { status: "limited", restrictions: {} }),
      trial(5, "2026-11-30T09:00:00Z", { status: "active" }),
    ];

    const body = await (await call()).json();

    expect(body.trials.map((t: { id: string; paused: boolean; days_remaining: number }) => [t.id, t.paused, t.days_remaining])).toEqual([
      ["shop-00002", true, 1],
      ["shop-00001", false, 2],
    ]);
    expect(body.summary).toEqual({ total: 2, expiringSoon: 2, expired: 0, healthy: 0 });
    // The pause's reason and dates stay on the shop page; the list says only that it is paused.
    expect(body.trials[0]).not.toHaveProperty("restrictions");
  });

  it("answers 500 when a page of trials fails, not with a short list", async () => {
    stub.state.failing.add("tenants");
    expect((await call()).status).toBe(500);
  });

  it("adds each shop's follow-up facts, its day since signup on the Baghdad calendar, and its follow-up groups", async () => {
    stub.state.tables.tenants = [
      // Signed up at 23:30 Baghdad last night: day 2 today, not day 1.
      trial(1, "2026-11-22T20:30:00Z", { created_at: "2026-11-15T20:30:00Z" }),
      // Signed up at 01:00 Baghdad today (22:00 UTC the day before): day 1.
      trial(2, "2026-11-23T22:00:00Z", { created_at: "2026-11-15T22:00:00Z" }),
      // Day 3, paused while on trial.
      trial(3, "2026-11-21T09:00:00Z", { created_at: "2026-11-14T09:00:00Z", status: "limited", restrictions: { status_before: "trial" } }),
      // Day 7: its trial ends at 06:21 tomorrow, the day the trial-end call is due.
      trial(4, "2026-11-17T03:21:00Z", { created_at: "2026-11-10T03:21:00Z" }),
      // Ended this morning, unpaid: locked.
      trial(5, "2026-11-16T03:21:00Z", { created_at: "2026-11-09T03:21:00Z" }),
    ];
    stub.state.functions.admin_trial_pipeline = () => ({
      data: [
        facts("shop-00001", {
          orders: 4, delivered: 1, shipped: true, whatsapp_sent: 37, prime_linked: true,
          last_call: { at: "2026-11-16T10:00:00Z", by: "Noor", outcome: "no_answer" },
        }),
        facts("shop-00002", { owner_phone: null }),
        facts("shop-00003", { trial_check: "review", trial_check_decision: null }),
        facts("shop-00004"),
        facts("shop-00005", { lock_reason: "trial_ended" }),
      ],
      error: null,
    });

    const body = await (await call()).json();
    type Listed = { id: string; trial_day: number; groups: string[]; follow_up: Row | null };
    const byId = new Map<string, Listed>(body.trials.map((t: Listed) => [t.id, t]));

    expect([...byId.values()].map((t) => [t.id, t.trial_day, t.groups])).toEqual([
      ["shop-00005", 8, ["locked"]],
      ["shop-00004", 7, ["last_day"]],
      ["shop-00003", 3, ["day_3", "paused"]],
      ["shop-00001", 2, []],
      ["shop-00002", 1, ["day_1"]],
    ]);
    expect(byId.get("shop-00001")?.follow_up).toEqual({
      tenant_id: "shop-00001",
      owner_phone: "07701234567",
      orders: 4, delivered: 1, shipped: true,
      whatsapp_sent: 37, whatsapp_cap: 200,
      prime_linked: true,
      trial_check: null, trial_check_decision: null,
      lock_reason: null,
      last_call: { at: "2026-11-16T10:00:00Z", by: "Noor", outcome: "no_answer" },
    });
    expect(byId.get("shop-00002")?.follow_up?.owner_phone).toBeNull();
    expect(byId.get("shop-00003")?.follow_up?.trial_check).toBe("review");
    expect(stub.state.rpcCalls.map((c) => c.fn)).toEqual(["admin_trial_pipeline"]);
  });

  it("keeps a shop that started its trial between the two reads, with no facts yet rather than zeros", async () => {
    stub.state.tables.tenants = [trial(1, "2026-11-30T09:00:00Z"), trial(2, "2026-11-30T09:00:00Z")];
    stub.state.functions.admin_trial_pipeline = () => ({ data: [facts("shop-00001")], error: null });

    const body = await (await call()).json();

    expect(body.trials.map((t: { id: string; follow_up: Row | null }) => [t.id, t.follow_up === null])).toEqual([
      ["shop-00001", false],
      ["shop-00002", true],
    ]);
  });

  it("answers 500 when the follow-up facts fail or come back in the wrong shape, not with zeros", async () => {
    stub.state.tables.tenants = [trial(1, "2026-11-30T09:00:00Z")];
    stub.state.functions.admin_trial_pipeline = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call()).status).toBe(500);

    stub.state.functions.admin_trial_pipeline = () => ({ data: [{ tenant_id: "shop-00001", orders: "four" }], error: null });
    expect((await call()).status).toBe(500);
  });
});
