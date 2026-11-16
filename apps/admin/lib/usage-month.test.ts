import { describe, expect, it } from "vitest";
import { usageMonthNow } from "./usage-month";

describe("usageMonthNow", () => {
  it("is the UTC month, the key the database gives a usage row", () => {
    expect(usageMonthNow(new Date("2026-11-16T08:00:00Z"))).toEqual({ year: 2026, month: 11 });
  });

  it("is still the old month at 01:00 on the 1st in Baghdad", () => {
    // 1 Dec 01:00 in Baghdad is 30 Nov 22:00 UTC: the shop's row is still November's.
    expect(usageMonthNow(new Date("2026-11-30T22:00:00Z"))).toEqual({ year: 2026, month: 11 });
  });

  it("turns with the UTC year", () => {
    expect(usageMonthNow(new Date("2027-01-01T00:00:00Z"))).toEqual({ year: 2027, month: 1 });
  });
});
