// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role: "super_admin" }) }));
vi.mock("@/hooks/use-admin-users", () => ({ useAdminUsers: () => ({ data: [] }) }));
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: async () => new Response(JSON.stringify({ entries: [], nextBefore: null }), { status: 200 }),
}));

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

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
