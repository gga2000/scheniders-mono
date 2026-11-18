import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = (query = "") => GET(new NextRequest(`http://admin.test/api/weekly-dashboard${query}`));

const week = (week_start: string, extra: Row = {}): Row => ({
  week_start,
  running: false,
  new_shops: 0,
  trials_started: 0,
  first_order_due: 0,
  first_order_72h: 0,
  became_paying: 0,
  became_paying_assisted: 0,
  paying_at_end: 0,
  churned: 0,
  trial_whatsapp_utility: 0,
  trial_whatsapp_marketing: 0,
  ...extra,
});

const answer = [
  week("2026-11-07", {
    new_shops: 6, trials_started: 5, first_order_due: 6, first_order_72h: 4,
    became_paying: 3, became_paying_assisted: 2, paying_at_end: 9, churned: 1,
    trial_whatsapp_utility: 40, trial_whatsapp_marketing: 5,
  }),
  week("2026-11-14", { running: true, new_shops: 2, trials_started: 2 }),
];

beforeEach(() => {
  stub = supabaseStub();
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.functions.admin_weekly_dashboard = () => ({ data: answer, error: null });
});

describe("GET /api/weekly-dashboard", () => {
  it("answers each week with its Friday, the 72-hour rate, self-serve payers and the trial WhatsApp cost", async () => {
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.weeks).toHaveLength(2);
    const [last, running] = body.weeks;
    expect(last).toMatchObject({
      week_start: "2026-11-07",
      week_end: "2026-11-13",
      running: false,
      new_shops: 6,
      trials_started: 5,
      // 4 of 6: 66.7, shown as 67.
      first_order_72h_rate: 67,
      became_paying: 3,
      became_paying_assisted: 2,
      became_paying_self_serve: 1,
      paying_at_end: 9,
      churned: 1,
      // 40 utility at 16 and 5 marketing at 58.
      trial_whatsapp_cost_iqd: 40 * 16 + 5 * 58,
    });
    // No shop of the running week is 72 hours old yet: no rate, not 0%.
    expect(running).toMatchObject({ week_start: "2026-11-14", week_end: "2026-11-20", running: true, first_order_72h_rate: null });
    // Eight weeks unless asked.
    expect(stub.state.rpcCalls).toEqual([{ fn: "admin_weekly_dashboard", args: { p_weeks: 8 } }]);
  });

  it("passes the weeks asked for and refuses a count the database would not take", async () => {
    await call("?weeks=12");
    expect(stub.state.rpcCalls.at(-1)?.args).toEqual({ p_weeks: 12 });

    for (const bad of ["0", "53", "1.5", "eight", ""]) {
      expect((await call(`?weeks=${bad}`)).status).toBe(400);
    }
    expect(stub.state.rpcCalls).toHaveLength(1);
  });

  it("answers 500 when the read fails or comes back in the wrong shape, never an empty dashboard", async () => {
    stub.state.functions.admin_weekly_dashboard = () => ({ data: null, error: { message: "connection lost" } });
    expect((await call()).status).toBe(500);

    stub.state.functions.admin_weekly_dashboard = () => ({ data: [{ week_start: "2026-11-14" }], error: null });
    expect((await call()).status).toBe(500);

    // A null answer is not an empty dashboard either.
    stub.state.functions.admin_weekly_dashboard = () => ({ data: null, error: null });
    expect((await call()).status).toBe(500);
  });
});
