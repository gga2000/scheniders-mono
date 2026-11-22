import { describe, expect, it } from "vitest";
import { goalStandings, monthBars, type PayingMerchants } from "./paying-merchants";

const shop = (n: number) => ({
  tenant_id: `shop-${n}`,
  display_id: 100_000 + n,
  name: `Shop ${n}`,
  plan: "starter",
  paid_until: "2026-12-10T09:00:00+00:00",
  month_end: "2026-12-10T09:00:00+00:00",
  first_paid_at: "2026-11-10T09:00:00+00:00",
  source: "signup" as const,
});

const report = (at: string, shops: number, monthEnds: [string, number][]): PayingMerchants => ({
  at,
  shops: Array.from({ length: shops }, (_, i) => shop(i + 1)),
  month_ends: monthEnds.map(([month, payers]) => ({ month, payers })),
});

describe("goal standings", () => {
  it("counts the shops paying now against a goal whose month has not ended", () => {
    expect(goalStandings(report("2026-11-18T23:30:00Z", 4, [["2026-10", 1]]))).toEqual([
      { month: "2026-12", goal: 15, payers: 4, final: false },
      { month: "2027-01", goal: 60, payers: 4, final: false },
    ]);
  });

  it("reads an ended month from its month-end count, and still counts the goal month while it runs", () => {
    expect(goalStandings(report("2027-01-05T10:00:00Z", 22, [["2026-11", 9], ["2026-12", 17]]))).toEqual([
      { month: "2026-12", goal: 15, payers: 17, final: true },
      { month: "2027-01", goal: 60, payers: 22, final: false },
    ]);
  });

  it("says it does not know an ended month the report does not reach, never the count today", () => {
    expect(goalStandings(report("2027-09-01T10:00:00Z", 80, [["2027-08", 75]]))[0]).toEqual({
      month: "2026-12",
      goal: 15,
      payers: null,
      final: false,
    });
  });

  it("counts the month on the Baghdad calendar: 1 Dec 01:00 in Baghdad is December", () => {
    // 30 Nov 22:00 UTC is 1 Dec 01:00 in Baghdad.
    expect(goalStandings(report("2026-11-30T22:00:00Z", 3, [["2026-11", 2]]))[0]).toMatchObject({ payers: 3, final: false });
  });
});

describe("month bars", () => {
  it("puts the past month ends oldest first, then the running month as it stands now", () => {
    expect(monthBars(report("2026-11-18T23:30:00Z", 2, [["2026-09", 0], ["2026-10", 1]]))).toEqual([
      { month: "2026-09", payers: 0, running: false },
      { month: "2026-10", payers: 1, running: false },
      { month: "2026-11", payers: 2, running: true },
    ]);
  });
});
