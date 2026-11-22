import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SERVER_MAX_ROWS, supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The bell's red row says the daily renewal job missed a shop. It used to
 * name every unpaid trial that ended more than a day ago, but under the lock
 * rule such a trial stays "trial" and is locked on purpose: the row would
 * have stayed red for good, and staff learn to ignore a bell like that.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const check = async () => (await GET(new NextRequest("http://admin.test/api/billing-check"))).json();

const NOW = Date.parse("2026-11-18T12:00:00Z");
const LONG_AGO = "2026-11-17T03:21:00Z"; // 32 hours before NOW

let n = 0;
const sub = (status: string, periodEnd: string, shop: Row, plan = "starter"): Row => {
  n += 1;
  return {
    id: `sub-${String(n).padStart(5, "0")}`,
    tenant_id: `shop-${n}`,
    status,
    plan,
    current_period_end: periodEnd,
    tenants: { business_name: `Shop ${n}`, status: "active", plan, is_demo: false, is_prospect: false, ...shop },
  };
};

beforeEach(() => {
  n = 0;
  stub = supabaseStub();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  return () => vi.useRealTimers();
});

describe("GET /api/billing-check", () => {
  it("is quiet when nothing was missed", async () => {
    stub.state.tables.subscriptions = [];
    expect(await check()).toEqual({ trialsNotBilled: [], renewalsMissed: [] });
  });

  it("never calls a locked trial a missed job", async () => {
    // The job reached it and the wallet was short: past_due, the shop keeps "trial" and is locked.
    stub.state.tables.subscriptions = [sub("past_due", LONG_AGO, { status: "trial" })];
    expect(await check()).toEqual({ trialsNotBilled: [], renewalsMissed: [] });
  });

  it("names a trial and a month the job never reached", async () => {
    stub.state.tables.subscriptions = [
      sub("trialing", LONG_AGO, { status: "trial" }),
      sub("active", LONG_AGO, { status: "active" }),
    ];

    expect(await check()).toEqual({
      trialsNotBilled: [{ tenant_id: "shop-1", business_name: "Shop 1", due: LONG_AGO }],
      renewalsMissed: [{ tenant_id: "shop-2", business_name: "Shop 2", due: LONG_AGO }],
    });
  });

  it("gives the job 25 hours after an end before it counts as missed", async () => {
    await check();
    // NOW less 25 hours: an end at 03:00 today (9 hours ago) is not asked for;
    // one at 03:01 yesterday, which today's 03:00 run could not reach, is not either.
    expect(stub.callsTo("subscriptions.lte")).toEqual([["current_period_end", "2026-11-17T11:00:00.000Z"]]);
  });

  it("leaves out the demo store and a store built for a lead, as every list in the console does", async () => {
    stub.state.tables.subscriptions = [
      sub("active", LONG_AGO, { is_demo: true }),
      sub("trialing", LONG_AGO, { status: "trial", is_prospect: true }),
    ];
    expect(await check()).toEqual({ trialsNotBilled: [], renewalsMissed: [] });
  });

  it("leaves out shops the job skips on purpose: on hold, paused or internal", async () => {
    stub.state.tables.subscriptions = [
      sub("active", LONG_AGO, { status: "suspended" }),
      sub("active", LONG_AGO, { status: "paused" }),
      sub("active", LONG_AGO, { status: "cancelled" }),
      sub("active", LONG_AGO, { status: "active" }, "internal"),
      // A house shop whose subscription row still names a paid plan.
      sub("active", LONG_AGO, { status: "active", plan: "internal" }),
    ];

    expect(await check()).toEqual({ trialsNotBilled: [], renewalsMissed: [] });
  });

  it("finds a missed shop past the first 1,000 rows", async () => {
    const fine = Array.from({ length: SERVER_MAX_ROWS + 10 }, () => sub("past_due", LONG_AGO, { status: "trial" }));
    stub.state.tables.subscriptions = [...fine, sub("active", LONG_AGO, { status: "active" })];

    const body = await check();

    expect(body.renewalsMissed).toEqual([{ tenant_id: "shop-1011", business_name: "Shop 1011", due: LONG_AGO }]);
  });

  it("answers 500 when the read fails, not with a quiet bell", async () => {
    stub.state.failing.add("subscriptions");
    const res = await GET(new NextRequest("http://admin.test/api/billing-check"));
    expect(res.status).toBe(500);
  });
});
