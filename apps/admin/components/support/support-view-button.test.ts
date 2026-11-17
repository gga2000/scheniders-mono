import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * Round 12: "End now" stayed on screen after the look's 30 minutes ran out,
 * and pressing it marked a look that was already over as ended by hand. The
 * box now goes once the time has passed.
 */

const NOW = Date.parse("2026-11-17T12:00:00Z");
let opened: { url: string; expiresAt: string } | null = null;
// The look the staff member opened: the only state this component keeps.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: () => [opened, () => {}] };
});
vi.mock("@/hooks/use-live-tick", () => ({ useLiveTick: () => NOW }));
vi.mock("@/hooks/use-support-cases", () => ({
  useSupportViewStart: () => ({ mutate: () => {}, isPending: false }),
  useSupportViewEnd: () => ({ mutate: () => {}, isPending: false }),
}));

const { SupportViewButton } = await import("./support-view-button");
const render = () => renderToStaticMarkup(createElement(SupportViewButton, { tenantId: "shop-1" }));
const look = (minutesLeft: number) => ({
  url: "https://example.test/look",
  expiresAt: new Date(NOW + minutesLeft * 60_000).toISOString(),
});

describe("SupportViewButton", () => {
  it("offers Open, Copy link and End now while the look runs", () => {
    opened = look(12);
    const html = render();
    expect(html).toContain("End now");
    expect(html).toContain("Copy link");
  });

  it("goes back to View as merchant once the 30 minutes have run out", () => {
    opened = look(-1);
    const html = render();
    expect(html).not.toContain("End now");
    expect(html).toContain("View as merchant");
  });
});
