import { describe, it, expect } from "vitest";
import { computeRatingSummary } from "./review";

describe("computeRatingSummary", () => {
  it("averages + counts + distributes", () => {
    const s = computeRatingSummary([
      { rating: 5 },
      { rating: 5 },
      { rating: 4 },
      { rating: 3 },
    ]);
    expect(s.count).toBe(4);
    expect(s.average).toBe(4.3); // 17/4 = 4.25 → 4.3
    expect(s.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 });
  });

  it("is empty-safe", () => {
    const s = computeRatingSummary([]);
    expect(s).toEqual({
      average: 0,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("ignores out-of-range ratings + rounds fractional", () => {
    const s = computeRatingSummary([
      { rating: 0 },
      { rating: 6 },
      { rating: 4.4 }, // → 4
      { rating: 2 },
    ]);
    expect(s.count).toBe(2);
    expect(s.average).toBe(3); // (4+2)/2
    expect(s.distribution[4]).toBe(1);
  });
});
