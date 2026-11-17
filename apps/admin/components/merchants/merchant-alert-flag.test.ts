import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantAlertFlag } from "./merchant-alert-flag";

/*
 * Round 12: the flag read the raw status, so a paused trial in its last days
 * showed no flag while "Needs attention" counted it.
 */

const render = (merchant: { status: string; restrictions?: unknown; trial_ends_at: string | null }) =>
  renderToStaticMarkup(createElement(MerchantAlertFlag, { merchant }));

beforeEach(() => {
  // Mon 16 Nov 2026, 12:00 in Baghdad.
  vi.useFakeTimers({ now: new Date("2026-11-16T09:00:00Z"), toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MerchantAlertFlag", () => {
  it("flags a paused trial that ends tomorrow, as it flags a trial", () => {
    const ends = "2026-11-17T09:00:00Z";
    expect(render({ status: "trial", trial_ends_at: ends })).toContain('aria-label="Trial ending"');
    expect(render({ status: "limited", restrictions: { status_before: "trial" }, trial_ends_at: ends })).toContain(
      'aria-label="Trial ending"',
    );
  });

  it("flags a paused trial that has ended", () => {
    const html = render({ status: "limited", restrictions: { status_before: "trial" }, trial_ends_at: "2026-11-14T09:00:00Z" });
    expect(html).toContain('aria-label="Trial ended"');
  });

  it("does not flag a paused paying shop by an old trial date", () => {
    expect(render({ status: "limited", restrictions: { status_before: "active" }, trial_ends_at: "2026-11-17T09:00:00Z" })).toBe("");
  });
});
