import { describe, expect, it, vi } from "vitest";
import {
  dayOfWeek,
  daysEnding,
  feesOf,
  fetchDashboardStats,
  fetchFees30d,
  fetchIncomeStats,
  fetchMerchantListStats,
  fetchTeamCounts,
  fetchUsageStats,
  monthLabel,
  monthOf,
  monthsEnding,
} from "./console-stats";
import { dashboardStats, incomeStats, SHOP_A, usageStats } from "./console-stats.test-data";
import { listStatsRow } from "./supabase-stub.test-data";

type Client = Parameters<typeof fetchDashboardStats>[0];

/** A client whose rpc() answers `data`, or fails with `error`. */
function client(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc, supabase: { rpc } as unknown as Client };
}

describe("calendar helpers", () => {
  it("lists the days ending today, oldest first", () => {
    expect(daysEnding("2026-11-02", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    const year = daysEnding("2026-11-16", 365);
    expect(year).toHaveLength(365);
    expect(year[0]).toBe("2025-11-17");
    expect(year[364]).toBe("2026-11-16");
  });

  it("knows the weekday of a day key without reading a time zone", () => {
    expect(dayOfWeek("2026-11-16")).toBe(1); // Monday
    expect(dayOfWeek("2026-11-15")).toBe(0); // Sunday
  });

  it("labels a month", () => {
    expect(monthLabel("2026-11")).toBe("Nov 26");
    expect(monthLabel("2026-01")).toBe("Jan 26");
  });

  it("files an instant under its Baghdad month", () => {
    expect(monthOf("2026-10-31T20:59:59Z")).toBe("2026-10"); // 23:59 in Baghdad
    expect(monthOf("2026-10-31T21:00:00Z")).toBe("2026-11"); // 00:00 on the 1st in Baghdad
    expect(monthOf(new Date("2026-12-31T21:30:00Z"))).toBe("2027-01");
  });

  it("lists the months ending this month, oldest first, across a year", () => {
    expect(monthsEnding("2026-11", 3)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(monthsEnding("2026-03", 6)).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  });
});

describe("feesOf", () => {
  it("adds the three things we sell and leaves other charges out", () => {
    expect(feesOf({ subscription: 9_000, orders: 1_100, whatsapp: 60 })).toBe(10_160);
    expect(feesOf(incomeStats().monthly[11])).toBe(10_160); // not 89,160
  });
});

describe("stats readers", () => {
  it("call their SQL function and return its checked answer", async () => {
    const d = client(dashboardStats());
    expect((await fetchDashboardStats(d.supabase)).orders.allTime).toBe(5445);
    expect(d.rpc).toHaveBeenCalledWith("admin_dashboard_stats", {});

    const i = client(incomeStats());
    expect((await fetchIncomeStats(i.supabase)).monthly).toHaveLength(12);
    expect(i.rpc).toHaveBeenCalledWith("admin_income_stats", {});
  });

  it("ask for one shop only when a shop is named", async () => {
    const all = client(usageStats());
    await fetchUsageStats(all.supabase, null);
    expect(all.rpc).toHaveBeenCalledWith("admin_usage_stats", {});

    const one = client(usageStats());
    await fetchUsageStats(one.supabase, SHOP_A);
    expect(one.rpc).toHaveBeenCalledWith("admin_usage_stats", { _tenant_id: SHOP_A });
  });

  it("throw on a database error instead of answering with nothing", async () => {
    const { supabase } = client(null, { message: "permission denied for function admin_dashboard_stats" });
    await expect(fetchDashboardStats(supabase)).rejects.toThrow(/admin_dashboard_stats failed: permission denied/);
  });

  it("throw on an answer in the wrong shape, naming where", async () => {
    const short = dashboardStats();
    short.orders.daily7 = [1, 2, 3];
    await expect(fetchDashboardStats(client(short).supabase)).rejects.toThrow(/cannot read \(at orders\.daily7\)/);

    await expect(fetchUsageStats(client(null).supabase, null)).rejects.toThrow(/cannot read/);
    await expect(fetchIncomeStats(client({ ...incomeStats(), monthly: [] }).supabase)).rejects.toThrow(/at monthly/);
  });
});

describe("Merchants list and Team readers", () => {
  it("ask for each shop once and key the answer by shop", async () => {
    const { rpc, supabase } = client([listStatsRow("a", { orders_30d: 1203 }), listStatsRow("b")]);

    const byShop = await fetchMerchantListStats(supabase, ["a", "b", "a"]);

    expect(rpc).toHaveBeenCalledWith("admin_merchant_list_stats", { _tenant_ids: ["a", "b"] });
    expect(byShop.get("a")?.orders_30d).toBe(1203);
    expect(byShop.size).toBe(2);
  });

  it("ask the database nothing for an empty page", async () => {
    const { rpc, supabase } = client([]);

    expect((await fetchMerchantListStats(supabase, [])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("throw when a shop that was asked for did not come back", async () => {
    const { supabase } = client([listStatsRow("a")]);

    await expect(fetchMerchantListStats(supabase, ["a", "b", "c"])).rejects.toThrow(/left out 2 of 3 shops/);
  });

  it("throw on a sparkline that is not 30 days, or a lock reason this app does not know", async () => {
    const short = client([listStatsRow("a", { order_sparkline: [1, 2, 3] })]);
    await expect(fetchMerchantListStats(short.supabase, ["a"])).rejects.toThrow(/at 0\.order_sparkline/);

    const odd = client([listStatsRow("a", { lock_reason: "paused" })]);
    await expect(fetchMerchantListStats(odd.supabase, ["a"])).rejects.toThrow(/at 0\.lock_reason/);
  });

  it("read the fees of a set of shops as one number", async () => {
    const { rpc, supabase } = client(23870);

    expect(await fetchFees30d(supabase, ["a", "b"])).toBe(23870);
    expect(rpc).toHaveBeenCalledWith("admin_fees_30d", { _tenant_ids: ["a", "b"] });
    await expect(fetchFees30d(client(null).supabase, ["a"])).rejects.toThrow(/cannot read/);
  });

  it("key the team counts by member of staff", async () => {
    const row = { user_id: "sara", leads_added: 3, leads_converted: 1, stores_built: 2, total_actions: 1500, commission_earned: 0, commission_pending: 0 };
    const { rpc, supabase } = client([row]);

    expect((await fetchTeamCounts(supabase)).get("sara")).toEqual(row);
    expect(rpc).toHaveBeenCalledWith("admin_team_counts", {});
    await expect(fetchTeamCounts(client([{ ...row, total_actions: "many" }]).supabase)).rejects.toThrow(/at 0\.total_actions/);
  });
});
