// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TenantStatus, TrialPayment } from "@/types/admin";

/*
 * The card menu offers only the moves admin_update_shop accepts
 * (lib/shop-status-choice). Since #1367 the server refuses Active over a
 * trial; round 12 found it also offering every move on a paused shop and
 * "Trial" on a paying one, each refused after a round trip.
 */

// The console's API calls go through adminFetch, which adds the session's
// token; here it passes each call to the fetch the test answers.
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: (input: string, init?: RequestInit) => fetch(input, init) }));
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { MerchantStatusDropdown } = await import("./merchant-status-dropdown");

afterEach(cleanup);

function showChip(status: TenantStatus, trialPayment: TrialPayment, client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <MerchantStatusDropdown merchantId="m1" status={status} trialPayment={trialPayment} />
    </QueryClientProvider>,
  );
}

function openMenu(status: TenantStatus, label: string, trialPayment: TrialPayment) {
  showChip(status, trialPayment);
  fireEvent.click(screen.getByRole("button", { name: label }));
  return screen.getAllByRole("button").map((button) => button.textContent);
}

describe("the card's status menu", () => {
  it("leaves Active out for a trial shop", () => {
    expect(openMenu("trial", "Trial", "never_paid")).toEqual(["Trial", "Trial", "On hold", "Cancelled"]);
  });

  it("leaves Trial out for a paying shop whose subscription is not a trial", () => {
    expect(openMenu("active", "Active", "paid")).toEqual(["Active", "Active", "On hold", "Cancelled"]);
  });

  it("offers Trial and Active to a held shop whose subscription is still a trial", () => {
    expect(openMenu("suspended", "On hold", "never_paid")).toEqual(["On hold", "Trial", "Active", "On hold", "Cancelled"]);
  });

  it("is no menu on a paused shop, whose chip reads Paused as every other screen does", () => {
    showChip("limited", "never_paid");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Paused")).toBeTruthy();
  });
});

/*
 * Round 14 (data new 3): a held trial never paid picked Active is saved as
 * Trial. The card shows the status the server will save while the save runs,
 * not Active first.
 */
describe("the card while a pick is saved", () => {
  afterEach(() => vi.unstubAllGlobals());

  function heldShopList(trialPayment: TrialPayment) {
    const client = new QueryClient();
    const shop = { id: "m1", status: "suspended", trial_payment: trialPayment };
    client.setQueryData(["admin", "merchants", "list"], { pages: [{ merchants: [shop] }], pageParams: [1] });
    // The save does not answer while the card is read.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    return client;
  }

  const shownStatus = (client: QueryClient) =>
    client.getQueryData<{ pages: Array<{ merchants: Array<{ status: string }> }> }>(["admin", "merchants", "list"])?.pages[0]
      .merchants[0].status;

  it("shows Trial at once when Active is picked for a held trial never paid", async () => {
    const client = heldShopList("never_paid");
    showChip("suspended", "never_paid", client);
    fireEvent.click(screen.getByRole("button", { name: "On hold" }));
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    await vi.waitFor(() => expect(shownStatus(client)).toBe("trial"));
  });

  it("shows Active when the held shop paid, or has no subscription", async () => {
    for (const trialPayment of ["paid", "no_subscription"] as const) {
      const client = heldShopList(trialPayment);
      showChip("suspended", trialPayment, client);
      fireEvent.click(screen.getByRole("button", { name: "On hold" }));
      fireEvent.click(screen.getByRole("button", { name: "Active" }));
      await vi.waitFor(() => expect(shownStatus(client)).toBe("active"));
      cleanup();
    }
  });
});
