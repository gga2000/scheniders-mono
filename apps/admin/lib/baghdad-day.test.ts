import { describe, it, expect } from "vitest";
import { addDays, baghdadWallTime, dayOf, lastDaysStart, readDayRange, trialClock } from "./baghdad-day";

/*
 * Shop #100095's trial ended at 06:21 Baghdad on 17 Nov. On the evening of
 * the 16th the Merchants banner said "Trial ends today", the Trials page said
 * "1 day remaining" and the shop's flag counted hours: three screens, three
 * answers, because each rounded hours on the server's clock. All of them now
 * count Baghdad calendar days here.
 */

const at = (baghdad: string) => Date.parse(`${baghdad}+03:00`);
const END = "2026-11-17T03:21:00Z"; // 06:21 Baghdad on 17 Nov

describe("dayOf", () => {
  it("names the Baghdad day, which starts three hours before the UTC one", () => {
    expect(dayOf("2026-11-15T21:30:00Z")).toBe("2026-11-16"); // 00:30 Baghdad
    expect(dayOf("2026-11-16T20:30:00Z")).toBe("2026-11-16"); // 23:30 Baghdad
    expect(dayOf(at("2026-11-17T00:00:00"))).toBe("2026-11-17");
  });
});

describe("addDays", () => {
  it("adds and subtracts days across month, year and leap-day edges", () => {
    expect(addDays("2026-11-16", -6)).toBe("2026-11-10");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("trialClock", () => {
  it("says a trial ending at 06:21 tomorrow ends tomorrow, at any hour today", () => {
    expect(trialClock(END, at("2026-11-16T00:30:00"))).toEqual({ ended: false, days: 1 });
    expect(trialClock(END, at("2026-11-16T23:30:00"))).toEqual({ ended: false, days: 1 });
  });

  it("says it ends today from Baghdad midnight until 06:21, and ended today after", () => {
    expect(trialClock(END, at("2026-11-17T00:00:00"))).toEqual({ ended: false, days: 0 });
    expect(trialClock(END, at("2026-11-17T06:20:59"))).toEqual({ ended: false, days: 0 });
    expect(trialClock(END, at("2026-11-17T06:21:00"))).toEqual({ ended: true, days: 0 });
    expect(trialClock(END, at("2026-11-17T23:59:00"))).toEqual({ ended: true, days: 0 });
  });

  it("counts the days since it ended below zero", () => {
    expect(trialClock(END, at("2026-11-18T00:00:00"))).toEqual({ ended: true, days: -1 });
    expect(trialClock(END, at("2026-11-19T12:00:00"))).toEqual({ ended: true, days: -2 });
  });

  it("counts a week ahead as 7 days, whatever the hour", () => {
    expect(trialClock(END, at("2026-11-10T23:59:00")).days).toBe(7);
    expect(trialClock(END, at("2026-11-10T00:01:00")).days).toBe(7);
  });
});

describe("readDayRange", () => {
  const read = (query: string) => readDayRange(new URLSearchParams(query));

  it("holds whole Baghdad days, the last one included", () => {
    expect(read("date_from=2026-11-16&date_to=2026-11-16")).toEqual({
      gte: "2026-11-16T00:00:00+03:00",
      lt: "2026-11-17T00:00:00+03:00",
    });
    expect(read("date_from=2026-11-01&date_to=2026-11-30")).toEqual({
      gte: "2026-11-01T00:00:00+03:00",
      lt: "2026-12-01T00:00:00+03:00",
    });
  });

  it("leaves out a bound that is not asked for", () => {
    expect(read("")).toEqual({ gte: null, lt: null });
    expect(read("date_from=")).toEqual({ gte: null, lt: null });
    expect(read("date_to=2026-12-31")).toEqual({ gte: null, lt: "2027-01-01T00:00:00+03:00" });
  });

  it("refuses a value that is not a day", () => {
    expect(read("date_from=2026-02-30")).toEqual({ error: "date_from must be a day such as 2026-11-16" });
    expect(read("date_to=2026-13-01")).toEqual({ error: "date_to must be a day such as 2026-11-16" });
    expect(read("date_to=16/11/2026")).toEqual({ error: "date_to must be a day such as 2026-11-16" });
    expect(read("date_from=2026-11-16T00:00:00Z")).toEqual({ error: "date_from must be a day such as 2026-11-16" });
  });
});

describe("lastDaysStart", () => {
  it("starts the last 7 days at Baghdad midnight, today included", () => {
    // 22:30 UTC on 16 Nov is already 01:30 on 17 Nov in Baghdad.
    expect(lastDaysStart(7, Date.parse("2026-11-16T22:30:00Z"))).toBe("2026-11-11T00:00:00+03:00");
    expect(lastDaysStart(7, Date.parse("2026-11-16T20:59:00Z"))).toBe("2026-11-10T00:00:00+03:00");
  });

  it("makes 1 day mean today only", () => {
    expect(lastDaysStart(1, Date.parse("2026-11-16T09:00:00Z"))).toBe("2026-11-16T00:00:00+03:00");
  });
});

/* Round 16 (Data new 1): a typed time was read in the browser's clock zone. */
describe("baghdadWallTime", () => {
  it("reads a typed day and time as Baghdad time", () => {
    expect(baghdadWallTime("2026-11-18T14:30")).toBe("2026-11-18T11:30:00.000Z");
    expect(baghdadWallTime("2026-11-18T00:15")).toBe("2026-11-17T21:15:00.000Z");
  });

  it("refuses what is not a real day and time", () => {
    expect(baghdadWallTime("")).toBeNull();
    expect(baghdadWallTime("2026-02-30T10:00")).toBeNull();
    expect(baghdadWallTime("2026-11-18T24:00")).toBeNull();
    expect(baghdadWallTime("2026-11-18T10:60")).toBeNull();
    expect(baghdadWallTime("2026-11-18")).toBeNull();
  });
});
