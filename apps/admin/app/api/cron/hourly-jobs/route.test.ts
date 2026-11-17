import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * Round 15 (Reliability new 4): a failed hourly run reached Sentry only while
 * someone had a console tab open, and a stopped or unscheduled job never did.
 * Vercel's scheduler now runs the check each hour and every problem goes to
 * Sentry.
 */

const cron = vi.hoisted(() => ({ refuse: null as Response | null }));
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: () => cron.refuse }));
const sentry = vi.hoisted(() => ({ captureException: vi.fn(), flush: vi.fn(async () => true) }));
vi.mock("@sentry/nextjs", () => sentry);

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const run = () => GET(new Request("https://console.test/api/cron/hourly-jobs"));

const NOW = Date.parse("2026-11-17T14:40:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const ran = (jobname: string, minutes: number, status = "succeeded"): Row => ({
  jobname,
  last_start: minutesAgo(minutes),
  last_status: status,
  last_message: status === "failed" ? "ERROR: something" : "1 row",
});

beforeEach(() => {
  cron.refuse = null;
  sentry.captureException.mockClear();
  sentry.flush.mockClear();
  stub = supabaseStub();
  stub.state.tables.tenants = [];
  stub.state.functions.staff_job_runs = () => ({ data: [ran("lift-ended-pauses", 19), ran("refresh-lead-scores", 13)], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  return () => vi.useRealTimers();
});

describe("GET /api/cron/hourly-jobs", () => {
  it("sends nothing while the jobs run", async () => {
    const res = await run();
    expect(await res.json()).toEqual({ jobs: 0, pausesNotLifted: 0 });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("sends a failed run with what it said, a stopped job and an unscheduled one, each as its own issue, before it answers", async () => {
    stub.state.functions.staff_job_runs = () => ({ data: [ran("lift-ended-pauses", 80)], error: null });
    await run();
    stub.state.functions.staff_job_runs = () => ({ data: [ran("lift-ended-pauses", 19), ran("refresh-lead-scores", 13, "failed")], error: null });
    const res = await run();
    expect(await res.json()).toEqual({ jobs: 1, pausesNotLifted: 0 });

    expect(sentry.captureException.mock.calls.map(([error, context]) => [String(error), context])).toEqual([
      [
        "Error: Hourly job lift-ended-pauses has not run within the hour",
        { fingerprint: ["hourly-job", "stopped", "lift-ended-pauses"], extra: { last_run: minutesAgo(80), message: null } },
      ],
      [
        "Error: Hourly job refresh-lead-scores is not scheduled",
        { fingerprint: ["hourly-job", "not_scheduled", "refresh-lead-scores"], extra: { last_run: null, message: null } },
      ],
      [
        "Error: Hourly job refresh-lead-scores failed",
        { fingerprint: ["hourly-job", "failed", "refresh-lead-scores"], extra: { last_run: minutesAgo(13), message: "ERROR: something" } },
      ],
    ]);
    expect(sentry.flush).toHaveBeenCalledTimes(2);
    expect(sentry.flush.mock.invocationCallOrder[1]).toBeGreaterThan(sentry.captureException.mock.invocationCallOrder[2]);
  });

  it("sends the paused customer shops the lift missed, by id only", async () => {
    stub.state.tables.tenants = [
      { id: "a", business_name: "Shop a", status: "limited", is_demo: false, is_prospect: false, restrictions: { paused_until: minutesAgo(90) } },
      { id: "b", business_name: "Shop b", status: "limited", is_demo: false, is_prospect: false, restrictions: { paused_until: minutesAgo(20) } },
      { id: "demo", business_name: "Demo", status: "limited", is_demo: true, is_prospect: false, restrictions: { paused_until: minutesAgo(90) } },
    ];
    expect(await (await run()).json()).toEqual({ jobs: 0, pausesNotLifted: 1 });
    expect(sentry.captureException).toHaveBeenCalledWith(new Error("Paused shops past their end were not lifted"), {
      fingerprint: ["hourly-pause-not-lifted"],
      extra: { shops: 1, tenant_ids: ["a"] },
    });
  });

  it("fails out loud when the check cannot read, so Sentry hears of that too", async () => {
    stub.state.functions.staff_job_runs = () => ({ data: null, error: { message: "permission denied" } });
    const res = await run();
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith("Scheduled hourly jobs check failed:", { message: "permission denied" });
    expect(sentry.flush).toHaveBeenCalled();
  });

  it("reads nothing when the guard refuses", async () => {
    cron.refuse = new Response(null, { status: 401 });
    expect((await run()).status).toBe(401);
    expect(stub.state.rpcCalls).toEqual([]);
  });
});

/** The middleware lets /api/cron/* through with no staff session: every route there must check the scheduler's secret, first. */
describe("the scheduled checks' routes", () => {
  const CRON_DIR = path.resolve(__dirname, "..");
  const routes = readdirSync(CRON_DIR, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith("route.ts"));

  it.each(routes)("%s checks the secret before anything else, and only answers reads", (file) => {
    const src = readFileSync(path.join(CRON_DIR, file), "utf8");
    expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)\b/);
    const body = src.split(/export async function GET\(request: Request\) \{/)[1] ?? "";
    expect(body.trimStart()).toMatch(/^const refused = requireCronAuth\(request\);\s*if \(refused\)/);
  });
});
