import { describe, expect, it } from "vitest";
import { pauseLiftOverdue } from "./tenant-pause";

/*
 * Round 12: the ended-pause line said the pause "clears at the shop's next
 * action". Since #1386 an hourly job lifts it, so staff are told it lifts
 * within the hour, and to lift it by hand once the hour has passed.
 */
describe("pauseLiftOverdue", () => {
  const ended = "2026-11-17T10:00:00Z";
  const at = (minutes: number) => Date.parse(ended) + minutes * 60_000;

  it("waits for the hourly lift for an hour and a few minutes after the end", () => {
    expect(pauseLiftOverdue(ended, at(0))).toBe(false);
    expect(pauseLiftOverdue(ended, at(59))).toBe(false);
    expect(pauseLiftOverdue(ended, at(65))).toBe(false);
  });

  it("says the lift is overdue once that has passed", () => {
    expect(pauseLiftOverdue(ended, at(66))).toBe(true);
    expect(pauseLiftOverdue(ended, at(24 * 60))).toBe(true);
  });
});
