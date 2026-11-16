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
  is_demo: false,
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

beforeEach(() => {
  stub = supabaseStub();
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

  it("counts days on the Baghdad calendar, soonest end first, and leaves the demo store out", async () => {
    stub.state.tables.tenants = [
      trial(1, "2026-11-17T03:21:00Z"), // 06:21 tomorrow: 1 day left
      trial(2, "2026-11-16T20:30:00Z"), // 23:30 tonight: ends today
      trial(3, "2026-11-16T18:00:00Z", { wallet: null }), // 21:00: ended today
      trial(4, "2026-11-30T09:00:00Z", { is_demo: true }),
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

  it("answers 500 when a page of trials fails, not with a short list", async () => {
    stub.state.failing.add("tenants");
    expect((await call()).status).toBe(500);
  });
});
