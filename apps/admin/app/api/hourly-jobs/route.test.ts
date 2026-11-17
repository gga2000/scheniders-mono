import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * Round 13 (Reliability new 3): the hourly jobs run in the database, and a
 * shop the pause lift failed on, or a failed lead score refresh, reached only
 * the database log. This route tells the staff bell.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const check = async () => GET(new NextRequest("http://admin.test/api/hourly-jobs"));

const NOW = Date.parse("2026-11-17T14:40:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const shop = (id: string, status: string, pausedUntil: unknown, kind: Row = {}): Row => ({
  id,
  business_name: `Shop ${id}`,
  status,
  is_demo: false,
  is_prospect: false,
  restrictions: { paused_until: pausedUntil, blocks: { new_orders: true } },
  ...kind,
});
const ran = (jobname: string, minutes: number, status = "succeeded"): Row => ({
  jobname,
  last_start: minutesAgo(minutes),
  last_status: status,
  last_message: status === "failed" ? "ERROR: something" : "1 row",
});

beforeEach(() => {
  sentry.captureException.mockClear();
  stub = supabaseStub();
  stub.state.tables.tenants = [];
  stub.state.functions.staff_job_runs = () => ({ data: [ran("lift-ended-pauses", 19), ran("refresh-lead-scores", 13)], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  return () => vi.useRealTimers();
});

describe("GET /api/hourly-jobs", () => {
  it("is quiet while the jobs run, and asks for the two hourly jobs", async () => {
    const res = await check();
    expect(await res.json()).toEqual({ pausesNotLifted: [], jobs: [] });
    expect(stub.state.rpcCalls).toEqual([{ fn: "staff_job_runs", args: { p_jobs: ["lift-ended-pauses", "refresh-lead-scores"] } }]);
    expect(stub.callsTo("tenants.eq")).toEqual([["status", "limited"]]);
    // Demo and prospect stores are not customers: staff are not asked to lift their pauses.
    expect(stub.callsTo("tenants.match")).toEqual([[{ is_demo: false, is_prospect: false }]]);
  });

  it("names a paused shop whose pause ended more than an hour ago, and only that one", async () => {
    stub.state.tables.tenants = [
      shop("a", "limited", minutesAgo(90)),
      shop("b", "limited", minutesAgo(20)),
      shop("c", "limited", new Date(NOW + 3_600_000).toISOString()),
      shop("d", "limited", null),
      shop("e", "limited", "not a time"),
      shop("demo", "limited", minutesAgo(90), { is_demo: true }),
    ];
    expect((await (await check()).json()).pausesNotLifted).toEqual([
      { tenant_id: "a", business_name: "Shop a", paused_until: minutesAgo(90) },
    ]);
  });

  it("names a failed lead score refresh and a pause lift that stopped", async () => {
    stub.state.functions.staff_job_runs = () => ({
      data: [ran("lift-ended-pauses", 80), ran("refresh-lead-scores", 13, "failed")],
      error: null,
    });
    expect((await (await check()).json()).jobs).toEqual([
      { job: "lift-ended-pauses", problem: "stopped", last_run: minutesAgo(80), message: null },
      { job: "refresh-lead-scores", problem: "failed", last_run: minutesAgo(13), message: "ERROR: something" },
    ]);
  });

  // Round 14 (Reliability new 4): the reason was read and dropped, and no
  // failure reached Sentry.
  it("says what the failed run said, and sends it to Sentry once", async () => {
    stub.state.functions.staff_job_runs = () => ({
      data: [ran("lift-ended-pauses", 19), ran("refresh-lead-scores", 3, "failed")],
      error: null,
    });
    expect((await (await check()).json()).jobs).toEqual([
      { job: "refresh-lead-scores", problem: "failed", last_run: minutesAgo(3), message: "ERROR: something" },
    ]);
    await check();
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [error, context] = sentry.captureException.mock.calls[0];
    expect(String(error)).toBe("Error: Hourly job refresh-lead-scores failed");
    expect(context).toEqual({
      fingerprint: ["hourly-job-failed", "refresh-lead-scores"],
      extra: { started: minutesAgo(3), message: "ERROR: something" },
    });
  });

  it("fails out loud when the runs cannot be read, so the bell says it could not check", async () => {
    stub.state.functions.staff_job_runs = () => ({ data: null, error: { message: "permission denied" } });
    const res = await check();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to check the hourly jobs" });
  });

  it("fails out loud when the paused shops cannot be read", async () => {
    stub.state.failing.add("tenants");
    expect((await check()).status).toBe(500);
  });
});
