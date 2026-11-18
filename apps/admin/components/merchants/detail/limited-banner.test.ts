import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AdminRole } from "@/types/admin";

/*
 * Round 12: an ended pause "clears at the shop's next action" was no longer
 * true once an hourly job lifts it (#1386, #1402). The banner says when it
 * lifts, and what to do when the hourly lift missed it.
 */

const NOW = Date.parse("2026-11-17T12:00:00Z");
let role: AdminRole = "super_admin";
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, error: null }),
}));
vi.mock("@/hooks/use-live-tick", () => ({ useLiveTick: () => NOW }));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role }) }));

const { LimitedBanner } = await import("./limited-banner");

const render = (pausedUntil: string | null) =>
  renderToStaticMarkup(
    createElement(LimitedBanner, {
      merchantId: "shop-1",
      restrictions: { paused_until: pausedUntil, blocks: { new_orders: true } },
    }),
  );
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe("LimitedBanner", () => {
  it("says an ended pause lifts on its own within the hour", () => {
    const html = render(minutesAgo(10));
    expect(html).toContain("It lifts on its own within the hour.");
    expect(html).not.toContain("next action");
  });

  it("tells whoever may lift it to lift a pause the hourly lift missed", () => {
    role = "super_admin";
    expect(render(minutesAgo(90))).toContain("did not lift on its own: nothing is stopped now. Lift the pause now to clear it.");
  });

  it("tells support staff to ask, since they cannot lift it", () => {
    role = "support_staff";
    const html = render(minutesAgo(90));
    expect(html).toContain("Ask a super admin to lift it.");
    expect(html).not.toContain("Lift the pause now");
    role = "super_admin";
  });

  it("names the end of a pause still running", () => {
    expect(render(new Date(NOW + 2 * 3_600_000).toISOString())).toContain("Lifts on its own");
  });

  // Round 13: the banner counted whole 24-hour spans ("in 2 days") where the
  // subscription card beside it counts Baghdad calendar days ("in 3 days").
  it("counts the days to the end on the Baghdad calendar", () => {
    // Tue 17 Nov 15:00 Baghdad; the pause ends Fri 20 Nov 06:00 Baghdad.
    const html = render("2026-11-20T03:00:00Z");
    expect(html).toContain("Lifts on its own Fri 20 Nov, 06:00, in 3 days.");
    expect(html).toContain("Stopped: new orders.");
  });

  // Round 13: past its end a pause stops nothing, so "Stopped: new orders"
  // beside "nothing is stopped now" said both.
  it("names nothing as stopped once the pause has ended", () => {
    for (const ago of [10, 90]) {
      const html = render(minutesAgo(ago));
      expect(html).not.toContain("Stopped:");
      expect(html).toContain("nothing is stopped now");
    }
  });
});
