// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-admin-users", () => ({ useAdminUsers: () => ({ data: [] }) }));
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: async () => new Response(JSON.stringify({ notes: [] }), { status: 200 }),
}));

import { QuickNotePopover } from "./quick-note-popover";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a quick note being written was gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(cleanup);

describe("QuickNotePopover: a quick note being written", () => {
  it("asks before the page is left, and lets it go once the note is closed", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(createElement(QueryClientProvider, { client }, createElement(QuickNotePopover, { merchantId: "m1" })));
    fireEvent.click(screen.getByLabelText("Quick note"));
    expect(leaving()).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Add a quick note... @ to mention"), { target: { value: "Owner is travelling" } });
    expect(leaving()).toBe(true);

    fireEvent.mouseDown(document.body);
    expect(leaving()).toBe(false);
  });
});
