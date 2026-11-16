import { describe, expect, it } from "vitest";
import { formatCount, formatDay, formatDayTime, formatIQD, formatUntil, formatWhen } from "./format";

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

describe("formatWhen", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("counts minutes and hours within the last day", () => {
    expect(formatWhen("2026-11-16T09:59:30Z", now)).toBe("just now");
    expect(formatWhen("2026-11-16T09:48:00Z", now)).toBe("12 min ago");
    expect(formatWhen("2026-11-16T05:00:00Z", now)).toBe("5 h ago");
    expect(formatWhen("2026-11-15T10:00:01Z", now)).toBe("23 h ago");
  });

  it("writes the day once a day has passed, never months ago", () => {
    expect(formatWhen("2026-11-15T10:00:00Z", now)).toBe("Sun 15 Nov");
    expect(formatWhen("2026-06-02T10:00:00Z", now)).toBe("Tue 2 Jun");
    expect(formatWhen("2025-04-09T09:00:00Z", now)).toBe("Wed 9 Apr 2025");
  });

  it("writes the day for a time still to come", () => {
    expect(formatWhen("2026-11-18T10:00:00Z", now)).toBe("Wed 18 Nov");
    expect(formatWhen("2026-11-16T10:00:20Z", now)).toBe("just now");
  });
});

describe("formatUntil", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("counts minutes, hours, then whole days", () => {
    expect(formatUntil("2026-11-16T10:40:00Z", now)).toBe("in 40 min");
    expect(formatUntil("2026-11-17T01:30:00Z", now)).toBe("in 15 h");
    expect(formatUntil("2026-11-17T12:00:00Z", now)).toBe("in 1 day");
    expect(formatUntil("2026-11-19T10:00:00Z", now)).toBe("in 3 days");
  });

  it("says ended once the time has passed", () => {
    expect(formatUntil("2026-11-16T09:59:00Z", now)).toBe("ended");
  });
});
