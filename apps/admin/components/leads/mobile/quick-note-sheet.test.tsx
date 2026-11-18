// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/hooks/use-lead-activities", () => ({ useCreateActivity: () => ({ mutate: vi.fn(), isPending: false }) }));

import { QuickNoteSheet } from "./quick-note-sheet";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a note being written on the phone was gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const sheet = (leadId: string | null) => createElement(QuickNoteSheet, { leadId, leadName: "Kawkab", onClose: () => {} });

afterEach(cleanup);

describe("QuickNoteSheet: a note being written", () => {
  it("asks before the page is left, and lets it go once the sheet is closed", () => {
    const view = render(sheet("l1"));
    expect(leaving()).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Add a note…"), { target: { value: "Wants Prime" } });
    expect(leaving()).toBe(true);

    view.rerender(sheet(null));
    expect(leaving()).toBe(false);
  });
});
