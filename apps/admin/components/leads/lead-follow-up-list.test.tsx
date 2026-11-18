// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock("@/hooks/use-lead-follow-ups", () => ({ useCreateFollowUp: () => mutation, useCompleteFollowUp: () => mutation }));

import { LeadFollowUpList } from "./lead-follow-up-list";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a follow-up being written was gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(cleanup);

describe("LeadFollowUpList: a follow-up being written", () => {
  it("asks before the page is left, and lets it go once the form is closed", () => {
    render(createElement(LeadFollowUpList, { followUps: [], leadId: "l1" }));
    fireEvent.click(screen.getByText("Schedule Follow-up"));
    expect(leaving()).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Follow-up title..."), { target: { value: "Call back about the store" } });
    expect(leaving()).toBe(true);

    fireEvent.click(screen.getAllByRole("button").find((button) => button.getAttribute("type") === "button") as HTMLElement);
    expect(leaving()).toBe(false);
  });
});
