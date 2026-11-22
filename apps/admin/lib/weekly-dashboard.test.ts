import { describe, expect, it } from "vitest";
import { weekSpan, weekSummary, type WeekRow } from "./weekly-dashboard";

const row = (extra: Partial<WeekRow> = {}): WeekRow => ({
  week_start: "2026-11-14",
  running: true,
  new_shops: 17,
  trials_started: 14,
  first_order_due: 7,
  first_order_72h: 3,
  became_paying: 3,
  became_paying_assisted: 2,
  paying_at_end: 9,
  churned: 1,
  trial_whatsapp_utility: 0,
  trial_whatsapp_marketing: 0,
  ...extra,
});

describe("a week's sums", () => {
  it("ends on the Friday, and splits paying into helped and alone", () => {
    const week = weekSummary(row());
    expect(week.week_end).toBe("2026-11-20");
    expect(week.first_order_72h_rate).toBe(43);
    expect(week.became_paying_self_serve).toBe(1);
  });

  it("has no first-order rate while no new shop's 72 hours are over", () => {
    expect(weekSummary(row({ first_order_due: 0, first_order_72h: 0 })).first_order_72h_rate).toBeNull();
  });
});

describe("the week's days in words", () => {
  it("names the month once inside a month, and both across two", () => {
    expect(weekSpan(weekSummary(row()))).toBe("14 to 20 Nov");
    expect(weekSpan(weekSummary(row({ week_start: "2026-11-28" })))).toBe("28 Nov to 4 Dec");
  });
});
