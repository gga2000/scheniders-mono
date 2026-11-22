// @vitest-environment jsdom
// Round 15 (new 1): when a sign-in ended, a background read reloaded the page,
// and a note half typed on the lead page's activity line was gone. Ten other
// boxes asked "Leave site?" first (#1461, #1462); this one did not.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-lead-activities", () => ({ useCreateActivity: () => ({ mutate: vi.fn(), isPending: false }) }));

const { LeadActivityTimeline } = await import("./lead-activity-timeline");

function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(cleanup);

describe("the lead page's activity line", () => {
  it("asks before the page is left while a note is typed, and not when the box is empty", () => {
    render(createElement(LeadActivityTimeline, { activities: [], leadId: "lead-1" }));
    expect(leaving()).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("Add a note..."), { target: { value: "Called, asks for prices" } });
    expect(leaving()).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Add a note..."), { target: { value: "  " } });
    expect(leaving()).toBe(false);
  });
});
