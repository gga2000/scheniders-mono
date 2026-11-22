import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadFailure } from "@/lib/load-failure";
import { LoadFailedLine } from "./load-failed-line";

/*
 * Round 22 (R3-10): Home re-reads every minute, and a failed re-read kept the
 * last numbers with nothing on screen to say so. The line now says the refresh
 * failed and how old the numbers are.
 */

const NOW = new Date("2026-11-22T16:30:00Z"); // 19:30 in Baghdad
const draw = (props: { error?: unknown; shownFrom?: number; kept?: "numbers" | "list" | "page"; gone?: string }) =>
  renderToStaticMarkup(createElement(LoadFailedLine, { what: "the dashboard", onRetry: () => {}, ...props }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("the load-failed line over kept numbers", () => {
  it("says the refresh failed and the time of the numbers still shown", () => {
    const html = draw({ error: new Error("fetch failed"), shownFrom: Date.parse("2026-11-22T15:42:00Z") });
    expect(html).toContain("Could not refresh the dashboard. These numbers are from 18:42.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Could not load");
  });

  it("names the day when the numbers are from an earlier day", () => {
    const html = draw({ error: new LoadFailure(500, "dashboard"), shownFrom: Date.parse("2026-11-21T15:42:00Z") });
    expect(html).toContain("These numbers are from Sat 21 Nov, 18:42.");
  });

  it("tells a login that lost the page so, with no button to press", () => {
    const html = draw({ error: new LoadFailure(403, "dashboard"), shownFrom: Date.parse("2026-11-22T15:42:00Z") });
    expect(html).toContain("Your login cannot open the dashboard any more. These numbers are from 18:42.");
    expect(html).not.toContain("<button");
  });

  it("calls a kept list a list, and a kept shop page a page, not numbers", () => {
    const at = Date.parse("2026-11-22T15:42:00Z");
    expect(draw({ error: new Error("fetch failed"), shownFrom: at, kept: "list" })).toContain(
      "Could not refresh the dashboard. This list is from 18:42.",
    );
    expect(draw({ error: new Error("fetch failed"), shownFrom: at, kept: "page" })).toContain(
      "Could not refresh the dashboard. This page is from 18:42.",
    );
  });

  it("says a thing that is gone is gone, over the page kept from before, with no button", () => {
    const at = Date.parse("2026-11-22T15:42:00Z");
    const html = draw({ error: new LoadFailure(404, "shop"), shownFrom: at, kept: "page", gone: "This shop is no longer there." });
    expect(html).toContain("This shop is no longer there. This page is from 18:42.");
    expect(html).not.toContain("<button");
  });

  it("keeps its words for a part with nothing to show", () => {
    expect(draw({ error: new Error("fetch failed") })).toContain("Could not load the dashboard.");
  });
});
