// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-admin-users", () => ({
  useAdminUsers: () => ({ data: [{ id: "u1", display_name: "Noor", role: "support" }] }),
}));
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: async () => new Response(JSON.stringify({ notes: [] }), { status: 200 }),
}));

import { QuickNotePopover } from "./quick-note-popover";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a quick note being written was gone. Leaving now asks first.
 * Round 17 (Craft new 6): the note opened inside the card and, on the first
 * card at 1280, ran under the menu. It is now drawn over the page.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(createElement(QueryClientProvider, { client }, createElement(QuickNotePopover, { merchantId: "m1" })));
  fireEvent.click(screen.getByLabelText("Quick note"));
  return view;
}

const box = () => screen.getByPlaceholderText("Add a quick note... @ to mention");

/** The pop-up listens for a press outside only after the press that opened it. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

afterEach(cleanup);

describe("QuickNotePopover: a quick note being written", () => {
  it("asks before the page is left, and lets it go once the note is closed", async () => {
    open();
    expect(leaving()).toBe(false);

    fireEvent.change(box(), { target: { value: "Owner is travelling" } });
    expect(leaving()).toBe(true);

    await settle();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(leaving()).toBe(false);
  });

  it("is drawn over the page, so the card and the menu cannot cut it", () => {
    const { container } = open();
    const dialog = screen.getByRole("dialog", { name: "Quick note" });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("Escape in the @ list closes the list only; a second Escape closes the note and keeps its words", async () => {
    open();
    fireEvent.change(box(), { target: { value: "Ask @No" } });
    expect(screen.getByRole("button", { name: /Noor/ })).toBeTruthy();

    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("button", { name: /Noor/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Quick note" })).toBeTruthy();

    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByLabelText("Quick note"));
    await settle();
    expect((box() as HTMLTextAreaElement).value).toBe("Ask @No");
  });
});
