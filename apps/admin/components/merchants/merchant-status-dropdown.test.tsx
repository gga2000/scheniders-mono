// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TenantStatus } from "@/types/admin";

/*
 * The card menu offers only the moves admin_update_shop accepts
 * (lib/shop-status-choice). Since #1367 the server refuses Active over a
 * trial; round 12 found it also offering every move on a paused shop and
 * "Trial" on a paying one, each refused after a round trip.
 */

vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { MerchantStatusDropdown } = await import("./merchant-status-dropdown");

afterEach(cleanup);

function showChip(status: TenantStatus, trialSubscription: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MerchantStatusDropdown merchantId="m1" status={status} trialSubscription={trialSubscription} />
    </QueryClientProvider>,
  );
}

function openMenu(status: TenantStatus, label: string, trialSubscription: boolean) {
  showChip(status, trialSubscription);
  fireEvent.click(screen.getByRole("button", { name: label }));
  return screen.getAllByRole("button").map((button) => button.textContent);
}

describe("the card's status menu", () => {
  it("leaves Active out for a trial shop", () => {
    expect(openMenu("trial", "Trial", true)).toEqual(["Trial", "Trial", "Suspended", "Cancelled"]);
  });

  it("leaves Trial out for a paying shop whose subscription is not a trial", () => {
    expect(openMenu("active", "Active", false)).toEqual(["Active", "Active", "Suspended", "Cancelled"]);
  });

  it("offers Trial and Active to a held shop whose subscription is still a trial", () => {
    expect(openMenu("suspended", "Suspended", true)).toEqual(["Suspended", "Trial", "Active", "Suspended", "Cancelled"]);
  });

  it("is no menu on a paused shop, whose chip reads Paused as every other screen does", () => {
    showChip("limited", true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Paused")).toBeTruthy();
  });
});
