import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";
import { facts, trial } from "@/lib/trial-shops.test-data";

/*
 * The follow-up facts (orders, WhatsApp, Prime, the last call, the trial
 * check) for every shop on trial, with its day since signup and its follow-up
 * groups. They used to ride in GET /api/trials, so their failure emptied the
 * Trials list (round 18). Here a failure answers 500 for this read alone.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/trials/follow-up"));

const NOW = Date.parse("2026-11-16T22:00:00+03:00");

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

describe("GET /api/trials/follow-up", () => {
  it("adds each shop's follow-up facts, its day since signup on the Baghdad calendar (Day 0 on signup, as the support plan counts), and its follow-up groups", async () => {
    stub.state.tables.tenants = [
      // Signed up at 23:30 Baghdad last night: Day 1 today, the plan's store-check day.
      trial(1, "2026-11-22T20:30:00Z", { created_at: "2026-11-15T20:30:00Z" }),
      // Signed up at 01:00 Baghdad today (22:00 UTC the day before): Day 0.
      trial(2, "2026-11-23T22:00:00Z", { created_at: "2026-11-15T22:00:00Z" }),
      // Day 3, the plan's first-order call, paused while on trial.
      trial(3, "2026-11-20T09:00:00Z", { created_at: "2026-11-13T09:00:00Z", status: "limited", restrictions: { status_before: "trial" } }),
      // Day 6: its trial ends at 06:21 tomorrow, the day the trial-end call is due.
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
      ["shop-00005", 7, ["locked"]],
      ["shop-00004", 6, ["last_day"]],
      ["shop-00003", 3, ["day_3", "paused"]],
      ["shop-00001", 1, ["day_1"]],
      ["shop-00002", 0, []],
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

  it("answers 500 when a page of trials fails, not with a short list", async () => {
    stub.state.failing.add("tenants");
    expect((await call()).status).toBe(500);
  });
});
