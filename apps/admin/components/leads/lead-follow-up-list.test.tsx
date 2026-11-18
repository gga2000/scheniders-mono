// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  mutation.mutate.mockClear();
});

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

/*
 * Round 16 (Data new 1): the time box has no zone, and its time was read in
 * the browser's: a follow-up set for 14:30 on a laptop in another zone was
 * saved for another hour. It is Baghdad's, as every time the console shows.
 */
describe("LeadFollowUpList: the time typed", () => {
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = zone;
  });

  it("is saved as Baghdad time, whatever the browser's zone", () => {
    const view = render(createElement(LeadFollowUpList, { followUps: [], leadId: "l1" }));
    fireEvent.click(screen.getByText("Schedule Follow-up"));
    fireEvent.change(screen.getByPlaceholderText("Follow-up title..."), { target: { value: "Call back" } });
    const when = view.container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(when, { target: { value: "2026-11-18T14:30" } });
    fireEvent.submit(when.closest("form") as HTMLFormElement);

    expect(mutation.mutate).toHaveBeenCalledTimes(1);
    expect(mutation.mutate.mock.calls[0][0]).toMatchObject({ leadId: "l1", scheduled_at: "2026-11-18T11:30:00.000Z" });
  });
});
