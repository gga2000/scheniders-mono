// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { canPickStatus } from "@/lib/shop-status-choice";

/*
 * Since #1367 the server refuses Active over any trial shop (still_trial):
 * a trial becomes a paying shop through "Start paid time, no charge" on its
 * page. The card menu offered Active anyway, and every pick was refused.
 */

vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { MerchantStatusDropdown } = await import("./merchant-status-dropdown");

afterEach(cleanup);

function openMenu(status: "trial" | "active") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MerchantStatusDropdown merchantId="m1" status={status} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: status === "trial" ? "Trial" : "Active" }));
  return screen.getAllByRole("button").map((button) => button.textContent);
}

describe("the card's status menu", () => {
  it("leaves Active out for a trial shop", () => {
    expect(openMenu("trial")).toEqual(["Trial", "Trial", "Suspended", "Cancelled"]);
  });

  it("still offers every pickable status to a paying shop", () => {
    expect(openMenu("active")).toEqual(["Active", "Trial", "Active", "Suspended", "Cancelled"]);
  });
});

describe("canPickStatus", () => {
  it("refuses only trial to active", () => {
    expect(canPickStatus("trial", "active")).toBe(false);
    expect(canPickStatus("trial", "suspended")).toBe(true);
    expect(canPickStatus("active", "trial")).toBe(true);
    expect(canPickStatus("suspended", "active")).toBe(true);
  });
});
