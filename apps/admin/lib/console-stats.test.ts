import { describe, expect, it, vi } from "vitest";
import {
  addDays,
  dayOfWeek,
  daysEnding,
  feesOf,
  fetchDashboardStats,
  fetchIncomeStats,
  fetchUsageStats,
  monthLabel,
} from "./console-stats";
import { dashboardStats, incomeStats, SHOP_A, usageStats } from "./console-stats.test-data";

type Client = Parameters<typeof fetchDashboardStats>[0];

/** A client whose rpc() answers `data`, or fails with `error`. */
function client(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc, supabase: { rpc } as unknown as Client };
}

describe("calendar helpers", () => {
  it("adds and subtracts days across month, year and leap-day edges", () => {
    expect(addDays("2026-11-16", -6)).toBe("2026-11-10");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

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
