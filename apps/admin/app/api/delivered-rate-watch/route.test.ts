import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

const guard = vi.hoisted(() => ({ allowed: true, actions: [] as string[] }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async (_request: unknown, action: string) => {
    guard.actions.push(action);
    return guard.allowed
      ? { user: { id: "a", email: "a@b.co" }, role: "super_admin" }
      : NextResponse.json({ error: "Your login cannot do this. Ask a super admin." }, { status: 403 });
  },
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (query = "") => GET(new NextRequest(`http://admin.test/api/delivered-rate-watch${query}`));

const shop = (name: string, extra: Row = {}): Row => ({
  tenant_id: `t-${name}`, display_id: 100_001, name, plan: "starter",
  shipped: 40, delivered: 32, rate: 80, stuck: 0, oldest_stuck_since: null, exports: 0, prime_linked: false,
  ...extra,
});

const watch = (shops: Row[], median: number | null = 80): Row => ({
  at: "2026-11-18T23:40:00+00:00",
  window_from: "2026-09-05T23:40:00+00:00",
  window_to: "2026-11-04T23:40:00+00:00",
  median_rate: median,
  shops,
});

beforeEach(() => {
  stub = supabaseStub();
  guard.allowed = true;
  guard.actions = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.functions.admin_delivered_rate_watch = () => ({ data: watch([]), error: null });
});

describe("GET /api/delivered-rate-watch", () => {
  it("flags a shop under 70% of the median or with 5 parcels stuck, never our own store", async () => {
    stub.state.functions.admin_delivered_rate_watch = () => ({
      data: watch([
        shop("leaky", { delivered: 22, rate: 55, stuck: 3 }),     // 55 < 56: far below
        shop("edge", { delivered: 23, rate: 56 }),                 // 56 is 70% of 80 exactly: not below
        shop("stuck", { stuck: 5, oldest_stuck_since: "2026-10-01T09:00:00+00:00" }),
        shop("small", { shipped: 6, delivered: 1, rate: null, stuck: 4 }),
        shop("ours", { plan: "internal", rate: 30, stuck: 28 }),
        shop("fine"),
      ]),
      error: null,
    });

    const body = await (await call()).json();
    const flags = Object.fromEntries(body.shops.map((s: Row) => [s.name, s.flags]));

    expect(guard.actions).toEqual(["manage_subscription"]);
    expect(flags).toEqual({
      leaky: ["far_below_median"],
      edge: [],
      stuck: ["stuck_parcels"],
      small: [],
      ours: [],
      fine: [],
    });
    expect(body.flagged).toBe(2);
    expect(body.median_rate).toBe(80);
    expect(body.rules).toEqual({ farBelowMedianShare: 0.7, stuckFlagMin: 5, stuckAfterDays: 14, minShippedForRate: 20 });
    expect(stub.state.rpcCalls).toEqual([{ fn: "admin_delivered_rate_watch", args: { p_days: 60 } }]);
  });

  it("draws the line to one decimal, so a rate on it is never flagged by float error", async () => {
    // 0.7 x 81.9 = 57.33 -> 57.3; 57.3 stays, 57.2 is below.
    stub.state.functions.admin_delivered_rate_watch = () => ({
      data: watch([shop("on", { rate: 57.3 }), shop("under", { rate: 57.2 })], 81.9),
      error: null,
    });
    const body = await (await call()).json();
    expect(body.shops.map((s: Row) => s.flags)).toEqual([[], ["far_below_median"]]);
  });

  it("flags no shop against a missing median", async () => {
    stub.state.functions.admin_delivered_rate_watch = () => ({ data: watch([shop("only", { rate: 10 })], null), error: null });
    const body = await (await call()).json();
    expect(body.shops[0].flags).toEqual([]);
  });

  it("passes the days asked for and refuses what the database would not take", async () => {
    await call("?days=90");
    expect(stub.state.rpcCalls.at(-1)?.args).toEqual({ p_days: 90 });
    for (const bad of ["6", "366", "two", ""]) {
      expect((await call(`?days=${bad}`)).status).toBe(400);
    }
    expect(stub.state.rpcCalls).toHaveLength(1);
  });

  it("is for the owners only", async () => {
    guard.allowed = false;
    expect((await call()).status).toBe(403);
    expect(stub.state.rpcCalls).toHaveLength(0);
  });

  it("answers 500 when the read fails or comes back in the wrong shape, never an empty watch", async () => {
    stub.state.functions.admin_delivered_rate_watch = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call()).status).toBe(500);

    stub.state.functions.admin_delivered_rate_watch = () => ({ data: { ...watch([]), shops: [{ name: "x" }] }, error: null });
    expect((await call()).status).toBe(500);
  });
});
