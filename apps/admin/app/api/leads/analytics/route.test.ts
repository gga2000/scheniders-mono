import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

/*
 * The Leads numbers were counted from one request for every lead. The API
 * returns at most 1,000 rows, so past that every count was short with no sign
 * of it. Months were cut on the server's UTC clock, and on the 29th to 31st of
 * a month the list of six months could name one month twice and skip another.
 */

vi.mock("@/lib/api-auth", () => ({
  requireBearerAdmin: async () => ({ user: { id: "a", email: "a@b.co" }, role: "super_admin" }),
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://admin.test/api/leads/analytics"));

const lead = (n: number, extra: Row = {}): Row => ({
  id: `lead-${n}`,
  status: "new",
  platform: "instagram",
  tier: "a",
  industry_id: null,
  lead_score: 50,
  estimated_monthly_revenue: 1000,
  assigned_to: null,
  created_by: "sara",
  created_at: "2026-11-10T09:00:00+00:00",
  converted_at: null,
  industry: null,
  is_draft: false,
  ...extra,
});

beforeEach(() => {
  stub = supabaseStub();
  stub.state.tables.leads = [lead(1)];
  stub.state.tables.user_profiles = [{ id: "sara", display_name: "Sara" }];
  // 12:00 in Baghdad on Monday 16 November 2026.
  vi.useFakeTimers({ now: new Date("2026-11-16T09:00:00Z"), toFake: ["Date"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/leads/analytics", () => {
  it("counts every lead when there are more than one page of them", async () => {
    stub.state.tables.leads = Array.from({ length: 1500 }, (_, n) => lead(n, n < 300 ? { status: "converted" } : {}));

    const stats = await (await call()).json();

    expect(stats.total_leads).toBe(1500);
    expect(stats.by_status).toEqual({ converted: 300, new: 1200 });
    expect(stats.conversion_rate).toBe(20);
    expect(stats.total_estimated_revenue).toBe(1200 * 1000);
    expect(stats.top_employees).toEqual([
      { user_id: "sara", display_name: "Sara", leads_added: 1500, leads_converted: 300, commission_earned: 0 },
    ]);
    expect(stub.callsTo("leads.range")).toEqual([
      [0, 999],
      [1000, 1999],
      [1500, 2499],
    ]);
  });

  it("ranks people by leads made shops, then by leads added, never by the order rows came in", async () => {
    // Round 10 (r8-5): with no conversions yet, the medals went to the fewest leads (3, 4, 6 before 15).
    const added = { a: 3, b: 4, c: 6, d: 15 };
    stub.state.tables.leads = Object.entries(added).flatMap(([who, count]) =>
      Array.from({ length: count }, (_, n) => lead(n, { id: `${who}-${n}`, created_by: who })),
    );
    stub.state.tables.user_profiles = Object.keys(added).map((id) => ({ id, display_name: id.toUpperCase() }));

    const order = async () => ((await (await call()).json()).top_employees as { user_id: string }[]).map((e) => e.user_id);
    expect(await order()).toEqual(["d", "c", "b", "a"]);

    stub.state.tables.leads.push(lead(99, { id: "a-99", created_by: "a", status: "converted", converted_at: "2026-11-12T09:00:00Z" }));
    expect(await order()).toEqual(["a", "d", "c", "b"]);
  });

  it("gives no average time to become a shop while no lead has, instead of 0 days", async () => {
    expect((await (await call()).json()).avg_time_to_convert_days).toBeNull();

    stub.state.tables.leads = [
      lead(1, { status: "converted", created_at: "2026-11-01T09:00:00Z", converted_at: "2026-11-04T09:00:00Z" }),
      lead(2, { status: "converted", created_at: "2026-11-01T09:00:00Z", converted_at: "2026-11-06T09:00:00Z" }),
    ];
    expect((await (await call()).json()).avg_time_to_convert_days).toBe(4);
  });

  it("reads pages in a fixed order and leaves drafts out", async () => {
    stub.state.tables.leads = [lead(1), lead(2, { is_draft: true })];

    const stats = await (await call()).json();

    expect(stats.total_leads).toBe(1);
    expect(stub.callsTo("leads.order").slice(0, 2)).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("files a lead under its Baghdad month", async () => {
    stub.state.tables.leads = [
      // 00:30 on 1 November in Baghdad: still 31 October on the UTC clock.
      lead(1, { created_at: "2026-10-31T21:30:00+00:00" }),
      // 23:30 on 31 October in Baghdad.
      lead(2, { created_at: "2026-10-31T20:30:00+00:00" }),
      // Added in September, converted at 00:10 on 1 November in Baghdad.
      lead(3, { created_at: "2026-09-10T09:00:00+00:00", converted_at: "2026-10-31T21:10:00+00:00", status: "converted" }),
    ];

    const { monthly_trends } = await (await call()).json();

    expect(monthly_trends).toEqual([
      { month: "2026-06", added: 0, converted: 0 },
      { month: "2026-07", added: 0, converted: 0 },
      { month: "2026-08", added: 0, converted: 0 },
      { month: "2026-09", added: 1, converted: 0 },
      { month: "2026-10", added: 1, converted: 0 },
      { month: "2026-11", added: 1, converted: 1 },
    ]);
  });

  it("names six different months on the last day of a long month", async () => {
    // 31 March: "one month ago" has no 31st, which used to give March twice and no February.
    vi.setSystemTime(new Date("2026-03-31T10:00:00Z"));

    const { monthly_trends } = await (await call()).json();

    expect(monthly_trends.map((row: Row) => row.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("starts the new month at midnight in Baghdad, three hours before UTC does", async () => {
    // 00:30 on 1 December in Baghdad.
    vi.setSystemTime(new Date("2026-11-30T21:30:00Z"));

    const { monthly_trends } = await (await call()).json();

    expect(monthly_trends.at(-1).month).toBe("2026-12");
  });

  it("answers with an error when a page of leads fails, not with a short count", async () => {
    stub.state.failing.add("leads");

    const response = await call();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to fetch analytics" });
  });

  it("answers with an error when the staff names cannot be read", async () => {
    stub.state.failing.add("user_profiles");

    expect((await call()).status).toBe(500);
  });
});
