import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { SHOP_A, usageStats } from "@/lib/console-stats.test-data";

/*
 * The usage page fetched a year of order rows oldest first. The API returns at
 * most 1,000 rows, so with 4,093 orders in the year the heatmap was blank after
 * 10 March. Days were cut on the UTC clock and hours on the server's clock.
 * The route must read per-day counts the database made on the Baghdad clock.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "a", email: "a@b.co" }, role: "support_staff" }),
}));

let answer: { data: unknown; error: { message: string } | null };
const rpc = vi.fn(async () => answer);
const from = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc, from }) }));

const { GET } = await import("./route");
const call = (query = "") => GET(new NextRequest(`http://admin.test/api/usage${query}`));

beforeEach(() => {
  rpc.mockClear();
  from.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  answer = { data: usageStats(), error: null };
});

describe("GET /api/usage", () => {
  it("takes the total from the database, not from a count of fetched rows", async () => {
    const body = await (await call()).json();

    expect(body.totalOrders).toBe(4093);
    expect(rpc).toHaveBeenCalledWith("admin_usage_stats", {});
    expect(from).not.toHaveBeenCalled();
  });

  it("lays out 365 Baghdad days ending today, with the hours as the database counted them", async () => {
    const body = await (await call()).json();

    expect(body.heatmapData).toHaveLength(365);
    expect(body.heatmapData[0]).toEqual({ date: "2025-11-17", count: 2 });
    expect(body.heatmapData.at(-1)).toEqual({ date: "2026-11-16", count: 3 });
    expect(body.hourlyCounts).toHaveLength(24);
    expect(body.hourlyCounts[21]).toBe(30);
  });

  it("sums weeks from Sunday to Saturday, ending with the week in progress", async () => {
    const body = await (await call()).json();

    expect(body.weeklyTrend).toHaveLength(52);
    // Today is Monday the 16th: this week holds Sunday (5) and today (3).
    expect(body.weeklyTrend.at(-1)).toEqual({ week: "2026-11-15", count: 8 });
    // The week before: Sunday the 8th (9) and Saturday the 14th (6).
    expect(body.weeklyTrend.at(-2)).toEqual({ week: "2026-11-08", count: 15 });
    expect(body.weeklyTrend[0].week).toBe("2025-11-23");
  });

  it("ranks the busiest days, and lists quiet days only when there are enough days to rank", async () => {
    const body = await (await call()).json();
    expect(body.busiestDays[0]).toEqual({ date: "2026-11-08", count: 9 });
    expect(body.quietestDays).toEqual([]);
  });

  it("asks for one shop when a shop is named", async () => {
    await call(`?tenant_id=${SHOP_A}`);
    expect(rpc).toHaveBeenCalledWith("admin_usage_stats", { _tenant_id: SHOP_A });
  });

  it("refuses a tenant id that is not a UUID", async () => {
    const res = await call("?tenant_id=1%20or%201=1");
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 500 when the database cannot be read", async () => {
    answer = { data: null, error: { message: "statement timeout" } };
    expect((await call()).status).toBe(500);
  });
});
