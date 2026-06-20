import { describe, it, expect } from "vitest";
import {
  zonedWallTimeToUtcISO,
  utcISOToZonedWallTime,
} from "./schedule-time";

// Asia/Baghdad is a fixed UTC+3 (no DST since 2008) — exact, deterministic.
const BG = "Asia/Baghdad";

describe("zonedWallTimeToUtcISO (EC21)", () => {
  it("interprets the wall time in the SELECTED zone, not the browser's", () => {
    // 14:00 Baghdad = 11:00 UTC, regardless of where this test runs.
    expect(zonedWallTimeToUtcISO("2026-06-20T14:00", BG)).toBe(
      "2026-06-20T11:00:00.000Z",
    );
  });

  it("rolls the date back across midnight correctly", () => {
    // 01:00 Baghdad = 22:00 UTC the PREVIOUS day.
    expect(zonedWallTimeToUtcISO("2026-06-20T01:00", BG)).toBe(
      "2026-06-19T22:00:00.000Z",
    );
  });

  it("treats a UTC zone as a pass-through", () => {
    expect(zonedWallTimeToUtcISO("2026-06-20T14:00", "UTC")).toBe(
      "2026-06-20T14:00:00.000Z",
    );
  });

  it("returns '' for malformed input", () => {
    expect(zonedWallTimeToUtcISO("", BG)).toBe("");
    expect(zonedWallTimeToUtcISO("not-a-date", BG)).toBe("");
  });
});

describe("utcISOToZonedWallTime (EC21)", () => {
  it("renders a UTC instant as the zone's wall clock", () => {
    expect(utcISOToZonedWallTime("2026-06-20T11:00:00.000Z", BG)).toBe(
      "2026-06-20T14:00",
    );
  });

  it("round-trips with zonedWallTimeToUtcISO", () => {
    const wall = "2026-12-31T23:30";
    const utc = zonedWallTimeToUtcISO(wall, BG);
    expect(utcISOToZonedWallTime(utc, BG)).toBe(wall);
  });

  it("returns '' for malformed input", () => {
    expect(utcISOToZonedWallTime("nope", BG)).toBe("");
  });
});
