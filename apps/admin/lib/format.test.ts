import { describe, expect, it } from "vitest";
import { formatCount, formatDay, formatDayTime, formatIQD } from "./format";

describe("formatIQD", () => {
  it("writes whole dinars with commas and IQD after", () => {
    expect(formatIQD(43_800)).toBe("43,800 IQD");
    expect(formatIQD(0)).toBe("0 IQD");
    expect(formatIQD(1_250_000)).toBe("1,250,000 IQD");
    expect(formatIQD(-5_000)).toBe("-5,000 IQD");
  });

  it("rounds a fraction away", () => {
    expect(formatIQD(54.6)).toBe("55 IQD");
  });
});

describe("formatCount", () => {
  it("writes a count with commas", () => {
    expect(formatCount(5_445)).toBe("5,445");
    expect(formatCount(7)).toBe("7");
  });
});

describe("formatDay", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("writes the Baghdad day, without the year this year", () => {
    expect(formatDay("2026-11-15T09:00:00Z", now)).toBe("Sun 15 Nov");
  });

  it("takes the day in Baghdad, not in UTC", () => {
    // 22:30 UTC on the 15th is 01:30 on the 16th in Baghdad.
    expect(formatDay("2026-11-15T22:30:00Z", now)).toBe("Mon 16 Nov");
  });

  it("adds the year for another year", () => {
    expect(formatDay("2025-04-09T09:00:00Z", now)).toBe("Wed 9 Apr 2025");
  });

  it("adds the Baghdad time when asked", () => {
    expect(formatDayTime("2026-11-15T11:05:00Z", now)).toBe("Sun 15 Nov, 14:05");
  });
});
