// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const idle = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));
vi.mock("@/hooks/use-saved-replies", () => ({
  useSavedReplies: () => ({
    data: [{ id: "r1", title: "Ask order number", body: "شنو رقم الطلب؟", position: 1 }],
    isLoading: false,
    isError: false,
  }),
  useAddSavedReply: idle,
  useChangeSavedReply: idle,
  useRemoveSavedReply: idle,
}));

import { SavedRepliesDialog } from "./saved-replies-dialog";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a saved reply being written was gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const dialog = () => createElement(SavedRepliesDialog, { open: true, onOpenChange: () => {} });

afterEach(cleanup);

describe("SavedRepliesDialog: a saved reply being written", () => {
  it("asks before the page is left once a new one is typed, and lets it go after Cancel", () => {
    render(dialog());
    fireEvent.click(screen.getByText("New saved reply"));
    expect(leaving()).toBe(false);

    fireEvent.change(screen.getByLabelText("Reply text"), { target: { value: "أهلا بيك" } });
    expect(leaving()).toBe(true);

    fireEvent.click(screen.getByText("Cancel"));
    expect(leaving()).toBe(false);
  });

  it("asks only once an opened one is changed", () => {
    render(dialog());
    fireEvent.click(screen.getByLabelText("Edit Ask order number"));
    expect(leaving()).toBe(false);

    fireEvent.change(screen.getByLabelText("Button name"), { target: { value: "Order number" } });
    expect(leaving()).toBe(true);
  });
});
