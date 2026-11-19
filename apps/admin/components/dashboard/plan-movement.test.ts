// The Plan Movements counts on Home. Each tile is about 73 px wide; the labels
// were "UPGRADES", "DOWNGRADES", "CANCELLATIONS" and "NEW SIGNUPS" in spaced
// capitals (77 to 118 px), so they ran into each other once the tiles showed.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlanMovement } from "@/types/dashboard";
import { PlanMovementWidget } from "./plan-movement";

const movements: PlanMovement[] = [
  { fromPlan: "starter", toPlan: "growth", count: 1, type: "upgrade" },
  { fromPlan: "new", toPlan: "starter", count: 2, type: "new" },
];

describe("PlanMovementWidget", () => {
  const html = renderToStaticMarkup(createElement(PlanMovementWidget, { movements }));

  it("heads each count with one short word, the full name on hover", () => {
    for (const [label, title] of [["Up", "Upgrades"], ["Down", "Downgrades"], ["Lost", "Cancelled by staff"], ["New", "New signups"]]) {
      expect(html).toContain(`title="${title}"`);
      expect(html).toMatch(new RegExp(`>${label}</p>`));
    }
    expect(html).not.toContain("uppercase");
  });

  it("never says \"Ended\", the word Trials uses for a trial that ran out", () => {
    expect(html).not.toMatch(/>Ended</);
  });

  it("counts the moves made and names each line", () => {
    expect(html).toMatch(/>1<\/p><p[^>]*>Up</);
    expect(html).toMatch(/>2<\/p><p[^>]*>New</);
    expect(html).toContain(">upgrade</span>");
  });

  // Home read "Starter → Growth", words the merchant never sees (round 19).
  it("names each plan as the merchant does", () => {
    expect(html).toMatch(/>Start<\/span>[\s\S]*>Team<\/span>/);
    expect(html).not.toMatch(/Starter|Growth/);
  });
});
