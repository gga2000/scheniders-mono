// The express offer clock under the price draws only for a real deadline.
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfferClock } from "./offer-clock";

type Clock = React.ComponentProps<typeof OfferClock>["clock"];

function render(clock: Clock): string {
  return renderToStaticMarkup(React.createElement(OfferClock, { clock, locale: "ar" }));
}

const label_i18n = { ar: "ينتهي العرض خلال" };

describe("OfferClock", () => {
  it("draws for the merchant's end time", () => {
    expect(render({ mode: "fixed_end", ends_at: "2099-01-01T00:00:00Z", label_i18n })).toContain('role="timer"');
  });

  it("draws nothing for a fixed end without a date", () => {
    expect(render({ mode: "fixed_end", label_i18n })).toBe("");
  });

  it("draws nothing for a midnight reset", () => {
    expect(render({ mode: "daily_reset", label_i18n })).toBe("");
  });

  it("keeps drawing a loop a store saved before (no editor offers a new one)", () => {
    expect(render({ mode: "evergreen_minutes", duration_minutes: 20, label_i18n })).toContain('role="timer"');
  });
});
