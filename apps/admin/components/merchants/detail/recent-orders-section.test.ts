import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoadFailure } from "@/lib/load-failure";

/*
 * A shop's "Latest orders" said "No orders yet." when its read failed, so a
 * shop with orders looked like one with none. A failed read now says so.
 */

let read: Record<string, unknown>;
vi.mock("@/hooks/use-merchant-detail", () => ({ useMerchantRecentOrders: () => read }));

const { RecentOrdersSection } = await import("./recent-orders-section");
const render = () => renderToStaticMarkup(createElement(RecentOrdersSection, { merchantId: "m1" }));

beforeEach(() => {
  read = { data: { orders: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false };
});

describe("a shop's latest orders", () => {
  it("says there are none when the read answered with none", () => {
    expect(render()).toContain("No orders yet.");
  });

  it("says it could not load them when the read failed, never 'No orders yet.'", () => {
    read = { ...read, data: undefined, isError: true, error: new LoadFailure(500, "recent orders") };
    const html = render();
    expect(html).toContain("Could not load the latest orders.");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No orders yet.");
  });

  it("gives a login that may not read them no Try again", () => {
    read = { ...read, data: undefined, isError: true, error: new LoadFailure(403, "recent orders") };
    const html = render();
    expect(html).toContain("Your login cannot open the latest orders.");
    expect(html).not.toContain("Try again");
  });
});
