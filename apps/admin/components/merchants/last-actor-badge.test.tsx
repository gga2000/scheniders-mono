// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LastActorBadge } from "./last-actor-badge";
import type { LastActor } from "@/hooks/use-last-actors";

/*
 * Round 24 UX new 4: a staff row with no name is named by its email (#1621,
 * as the shop timeline names it), and the badge's card then said the email
 * twice: once as the name and once under it.
 */
const step = (actor: Partial<LastActor>): LastActor => ({
  display_name: "Noor",
  email: "noor@example.com",
  avatar_url: null,
  action: "note",
  when: "2026-11-22T10:00:00Z",
  is_system: false,
  ...actor,
});

afterEach(cleanup);

function open(actor: LastActor) {
  const { container } = render(createElement(LastActorBadge, { actor }));
  const badge = container.querySelector('[class*="group/lastactor"]');
  if (!badge) throw new Error("no badge drawn");
  fireEvent.mouseEnter(badge);
}

describe("the last-done-by badge's card", () => {
  it("says the email once when it is also the name", () => {
    open(step({ display_name: "noor@example.com" }));
    expect(screen.getAllByText("noor@example.com")).toHaveLength(1);
  });

  it("says the name and, under it, the email when the two differ", () => {
    open(step({}));
    expect(screen.getByText("Noor")).toBeTruthy();
    expect(screen.getByText("noor@example.com")).toBeTruthy();
  });
});
