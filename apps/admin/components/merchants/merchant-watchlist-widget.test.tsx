// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Round 10: Home's Watchlist said "No starred merchants" when the stars
 * could not be read, and for a moment on every load before they arrived.
 * The tile now waits for the stars, and says when they could not be loaded.
 */

/** What the stars read gives: the server's stars, still loading, or failed after its retries. */
let read: { data?: { watchlist: { tenant_id: string }[] }; isError: boolean } = { isError: false };
// The console's API calls go through adminFetch, which adds the session's
// token; here it passes each call to the fetch the test answers.
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: (input: string, init?: RequestInit) => fetch(input, init) }));
vi.mock("@/hooks/use-watchlist", () => ({ useWatchlist: () => read }));
vi.stubGlobal("fetch", () =>
  Promise.resolve(new Response(JSON.stringify({ merchants: [{ id: "a", business_name: "Shop A", status: "active" }] }))),
);

const { useAdminStore } = await import("@/store/use-admin-store");
const { MerchantWatchlistWidget } = await import("./merchant-watchlist-widget");

const mount = (starred: string[]) => {
  useAdminStore.setState({ starredMerchants: starred });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MerchantWatchlistWidget />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  read = { isError: false };
});
afterEach(cleanup);

describe("MerchantWatchlistWidget", () => {
  it("says the stars could not be loaded when that read failed, never 'No starred merchants'", () => {
    read = { isError: true };
    mount([]);

    expect(screen.getByText("Your stars could not be loaded")).toBeTruthy();
    expect(screen.queryByText("No starred merchants")).toBeNull();
  });

  it("shows the loading rows while the stars are still being read", () => {
    const { container } = mount([]);

    expect(screen.queryByText("No starred merchants")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBe(1);
  });

  it("says 'No starred merchants' once the stars are read and there are none", () => {
    read = { data: { watchlist: [] }, isError: false };
    mount([]);

    expect(screen.getByText("No starred merchants")).toBeTruthy();
  });

  it("lists the starred shops", async () => {
    read = { data: { watchlist: [{ tenant_id: "a" }] }, isError: false };
    mount(["a"]);

    expect(await screen.findByText("Shop A")).toBeTruthy();
  });
});
