// A clock draws only for a deadline that is real (helpers/countdown.ts).
import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_MODES,
  RESTARTING_COUNTDOWN_MODES,
  countdownCycleMs,
  countdownDraws,
  countdownRemainingMs,
} from "./countdown";

const NOW = new Date("2026-11-16T12:00:00Z");

describe("countdownRemainingMs", () => {
  it("counts to the merchant's end time, the same for every visitor", () => {
    expect(countdownRemainingMs("fixed_end", "2026-11-16T14:30:00Z", undefined, NOW, false)).toBe(
      2.5 * 60 * 60 * 1000,
    );
  });

  it("reaches 0 once the end time passes, and stays there", () => {
    expect(countdownRemainingMs("fixed_end", "2026-11-16T11:00:00Z", undefined, NOW, false)).toBe(0);
  });

  it("has no clock for a fixed end without a usable date (it used to fall back to midnight)", () => {
    expect(countdownRemainingMs("fixed_end", undefined, undefined, NOW, false)).toBeNull();
    expect(countdownRemainingMs("fixed_end", "", undefined, NOW, false)).toBeNull();
    expect(countdownRemainingMs("fixed_end", "soon", undefined, NOW, false)).toBeNull();
  });

  it("never draws a midnight reset, kept or not", () => {
    expect(countdownRemainingMs("daily_reset", undefined, undefined, NOW, false)).toBeNull();
    expect(countdownRemainingMs("daily_reset", undefined, undefined, NOW, true)).toBeNull();
  });

  it("draws a loop only where the caller keeps a stored one", () => {
    expect(countdownRemainingMs("evergreen_minutes", undefined, 20, NOW, false)).toBeNull();
    const ms = countdownRemainingMs("evergreen_minutes", undefined, 20, NOW, true);
    expect(ms).not.toBeNull();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(20 * 60 * 1000);
  });
});

describe("countdownDraws / countdownCycleMs", () => {
  it("agrees with countdownRemainingMs on whether a clock exists", () => {
    const cases: [Parameters<typeof countdownDraws>, boolean][] = [
      [["fixed_end", "2026-12-01T00:00:00Z", false], true],
      [["fixed_end", undefined, true], false],
      [["daily_reset", undefined, true], false],
      [["evergreen_minutes", undefined, false], false],
      [["evergreen_minutes", undefined, true], true],
    ];
    for (const [args, draws] of cases) expect(countdownDraws(...args), JSON.stringify(args)).toBe(draws);
  });

  it("only a loop has a cycle for the progress hairline", () => {
    expect(countdownCycleMs("evergreen_minutes", 20)).toBe(20 * 60 * 1000);
    expect(countdownCycleMs("daily_reset", undefined)).toBeNull();
    expect(countdownCycleMs("fixed_end", undefined)).toBeNull();
  });

  it("retires exactly the modes that restart on their own (the database guard counts the same two)", () => {
    expect([...RESTARTING_COUNTDOWN_MODES].sort()).toEqual(["daily_reset", "evergreen_minutes"]);
    expect(COUNTDOWN_MODES.filter((m) => !RESTARTING_COUNTDOWN_MODES.includes(m))).toEqual(["fixed_end"]);
  });
});
