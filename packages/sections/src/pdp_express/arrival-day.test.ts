// Arrival day: Baghdad calendar days, today/tomorrow named, Latin digits.

import { describe, expect, it } from "vitest";
import { formatArrivalDay } from "./arrival-day";

describe("formatArrivalDay", () => {
  // 3 Nov 2026, 20:00 UTC = 23:00 in Baghdad (a Tuesday).
  const lateTuesday = new Date("2026-11-03T20:00:00Z");

  it("24 hours from a Tuesday evening is tomorrow, Wednesday 4 November", () => {
    expect(formatArrivalDay(lateTuesday, 24, "ar")).toBe("باچر، الأربعاء، 4 تشرين الثاني");
    expect(formatArrivalDay(lateTuesday, 24, "en")).toBe("Tomorrow, Wednesday 4 November");
  });

  it("reads the day in Baghdad, not UTC", () => {
    // 22:30 UTC on the 3rd is already 01:30 on Wednesday in Baghdad.
    const afterMidnight = new Date("2026-11-03T22:30:00Z");
    expect(formatArrivalDay(afterMidnight, 12, "ar")).toBe("اليوم، الأربعاء، 4 تشرين الثاني");
  });

  it("two days or more: the date alone", () => {
    expect(formatArrivalDay(lateTuesday, 48, "ar")).toBe("الخميس، 5 تشرين الثاني");
  });
});
