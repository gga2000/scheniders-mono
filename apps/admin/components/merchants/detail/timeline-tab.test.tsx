// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: "super_admin" }) }));
vi.mock("@/hooks/use-admin-users", () => ({ useAdminUsers: () => ({ data: [] }) }));
const answer = vi.hoisted(() => ({ next: async (): Promise<Response> => new Response(JSON.stringify({ entries: [], nextBefore: null }), { status: 200 }) }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: () => answer.next() }));

import { TimelineTab } from "./timeline-tab";

/*
 * Round 16 (R15 Workflow new 1): when a sign-in ended, the console reloaded
 * the page and a shop note being written was gone. Leaving now asks first.
 */
function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function renderTab(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(createElement(QueryClientProvider, { client }, createElement(TimelineTab, { merchantId: "m1" })));
}

afterEach(cleanup);

describe("TimelineTab: a shop note being written", () => {
  it("asks before the page is left, and lets it go once the box is empty again", () => {
    renderTab();
    expect(leaving()).toBe(false);

    const box = screen.getByPlaceholderText("What should colleagues know before they call? Use @ to name someone.");
    fireEvent.change(box, { target: { value: "Call after 6 pm" } });
    expect(leaving()).toBe(true);

    fireEvent.change(box, { target: { value: "  " } });
    expect(leaving()).toBe(false);
  });
});

/*
 * Round 24 structure new 2: the timeline is read again after every step on
 * the shop. One failed re-read, or a failed "Show older", replaced every
 * entry on screen with its error.
 */
describe("TimelineTab when a later read fails", () => {
  const entry = { id: "e1", kind: "note", at: "2026-11-22T15:00:00Z", title: "Note", who: "Noor", detail: "Call after 6" };
  const page = (nextBefore: string | null) =>
    new Response(JSON.stringify({ entries: [entry], nextBefore }), { status: 200 });

  it("keeps the entries and says the refresh failed", async () => {
    answer.next = async () => page(null);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderTab(client);
    await screen.findByText("Call after 6");
    answer.next = async () => {
      throw new TypeError("Failed to fetch");
    };
    await act(() => client.refetchQueries({ queryKey: ["admin", "merchant", "m1"] }));
    await waitFor(() => expect(screen.getByText(/Could not refresh the timeline\. This list is from/)).toBeTruthy());
    expect(screen.getByText("Call after 6")).toBeTruthy();
  });

  it("keeps the entries when older ones fail to load, and offers them again", async () => {
    answer.next = async () => page("2026-11-22T15:00:00Z");
    renderTab();
    await screen.findByText("Call after 6");
    answer.next = async () => new Response("{}", { status: 502 });
    fireEvent.click(screen.getByRole("button", { name: "Show older" }));
    await screen.findByText(/Could not load older entries/);
    expect(screen.getByText("Call after 6")).toBeTruthy();
    expect(screen.queryByText(/Could not refresh/)).toBeNull();
  });
});
