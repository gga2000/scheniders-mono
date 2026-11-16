import { describe, expect, it } from "vitest";
import { isSupportOpen, supportClockStart, supportWaitMinutes } from "./support-hours";

const at = (iso: string) => Date.parse(iso);

describe("support hours (9 AM to 12 AM Baghdad)", () => {
  it("is open from 9 AM to midnight and closed after midnight", () => {
    expect(isSupportOpen(at("2026-11-16T09:00:00+03:00"))).toBe(true);
    expect(isSupportOpen(at("2026-11-16T23:59:00+03:00"))).toBe(true);
    expect(isSupportOpen(at("2026-11-17T00:00:00+03:00"))).toBe(false);
    expect(isSupportOpen(at("2026-11-16T08:59:00+03:00"))).toBe(false);
  });

  it("starts the clock right away inside hours", () => {
    expect(supportClockStart(at("2026-11-16T12:00:00+03:00"))).toBe(at("2026-11-16T12:00:00+03:00"));
    expect(supportClockStart(at("2026-11-16T09:00:00+03:00"))).toBe(at("2026-11-16T09:00:00+03:00"));
  });

  it("starts the clock at 9 AM the same Baghdad day for a night message", () => {
    expect(supportClockStart(at("2026-11-16T00:30:00+03:00"))).toBe(at("2026-11-16T09:00:00+03:00"));
    // 22:00 UTC is 1 AM the next Baghdad day.
    expect(supportClockStart(at("2026-11-15T22:00:00Z"))).toBe(at("2026-11-16T09:00:00+03:00"));
  });

  it("counts waiting minutes from the clock start", () => {
    expect(supportWaitMinutes(at("2026-11-16T03:00:00+03:00"), at("2026-11-16T09:03:00+03:00"))).toBe(3);
    expect(supportWaitMinutes(at("2026-11-16T03:00:00+03:00"), at("2026-11-16T05:00:00+03:00"))).toBe(0);
    expect(supportWaitMinutes(at("2026-11-16T12:00:00+03:00"), at("2026-11-16T12:07:30+03:00"))).toBe(7);
  });
});
