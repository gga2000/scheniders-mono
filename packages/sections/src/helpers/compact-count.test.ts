import { describe, expect, it } from "vitest";
import { roundDownCompact, formatCompactCount } from "./compact-count";

describe("roundDownCompact", () => {
  it("rounds DOWN to two significant figures at or above 100", () => {
    expect(roundDownCompact(2693)).toBe(2600);
    expect(roundDownCompact(4465)).toBe(4400);
    expect(roundDownCompact(150)).toBe(150);
    expect(roundDownCompact(159)).toBe(150);
  });

  it("never rounds up — a displayed count may only understate", () => {
    for (const n of [101, 199, 999, 1001, 9999, 12345]) {
      expect(roundDownCompact(n)).toBeLessThanOrEqual(n);
    }
  });

  it("returns small counts exactly", () => {
    expect(roundDownCompact(18)).toBe(18);
    expect(roundDownCompact(99)).toBe(99);
  });

  it("treats absent or non-positive counts as nothing to show", () => {
    expect(roundDownCompact(0)).toBe(0);
    expect(roundDownCompact(-5)).toBe(0);
    expect(roundDownCompact(Number.NaN)).toBe(0);
  });
});

describe("formatCompactCount", () => {
  it("prefixes + only when the figure was rounded down", () => {
    expect(formatCompactCount(2693)).toBe("+2600");
    expect(formatCompactCount(18)).toBe("18");
    // Already on the step: nothing was dropped, so nothing is implied.
    expect(formatCompactCount(2600)).toBe("2600");
  });

  it("returns null when there is nothing true to show", () => {
    expect(formatCompactCount(0)).toBeNull();
    expect(formatCompactCount(undefined)).toBeNull();
  });
});
