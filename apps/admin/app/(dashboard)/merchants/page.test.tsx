import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { DehydratedState } from "@tanstack/react-query";

/*
 * Speed audit round 3: Merchants asked for its shops and numbers only after
 * its JS ran. It now reads them on the server, with the same staff check as
 * the routes, under the keys the page reads when it opens.
 */

const staff = vi.hoisted(() => ({ current: null as null | { user: { id: string }; role: string } }));
const readList = vi.hoisted(() => vi.fn<(params: URLSearchParams) => Promise<object>>(async () => ({ merchants: [], total: 0, page: 1, limit: 50 })));
const readStats = vi.hoisted(() => vi.fn<(params: URLSearchParams) => Promise<object>>(async () => ({ total: 3 })));
vi.mock("@/lib/api-auth", () => ({ adminFromCookies: async () => staff.current }));
vi.mock("@/lib/merchants-list", () => ({ readMerchantsList: readList }));
vi.mock("@/lib/merchants-stats", () => ({ readMerchantsStats: readStats }));
vi.mock("@/lib/admin-fetch", () => ({ leaveIfSignedOut: vi.fn() }));
vi.mock("@/components/merchants/merchants-view", () => ({ MerchantsView: () => null }));

import MerchantsPage from "./page";
import { useAdminStore } from "@/store/use-admin-store";
import { merchantSortParam, merchantsListKey, merchantsStatsKey } from "@/lib/merchants-query";

async function pageState(): Promise<DehydratedState> {
  const page = (await MerchantsPage()) as ReactElement<{ state: DehydratedState }>;
  return page.props.state;
}

describe("Merchants' server read", () => {
  it("arrives with the first page and the numbers, under the keys the page opens with", async () => {
    staff.current = { user: { id: "u1" }, role: "super_admin" };
    const state = await pageState();

    // The keys the hooks build from the store as it starts (no filter, default order).
    const opening = useAdminStore.getState();
    const keys = state.queries.map((q) => q.queryKey);
    expect(keys).toContainEqual(merchantsListKey(opening, 50, merchantSortParam(opening.sortConfig)));
    expect(keys).toContainEqual(merchantsStatsKey({ ...opening, statusFilter: null }));

    const list = state.queries.find((q) => q.queryKey[2] === "infinite")?.state.data as { pages: unknown[]; pageParams: unknown[] };
    expect(list.pageParams).toEqual([1]);
    expect(list.pages[0]).toMatchObject({ merchants: [], total: 0, page: 1, limit: 50 });
    expect(Object.fromEntries(readList.mock.calls[0][0])).toEqual({
      page: "1",
      limit: "50",
      sort: "created_at:desc",
      include_sparkline: "true",
    });
  });

  it("reads nothing without a staff sign-in", async () => {
    staff.current = null;
    readList.mockClear();
    readStats.mockClear();
    expect((await pageState()).queries).toHaveLength(0);
    expect(readList).not.toHaveBeenCalled();
    expect(readStats).not.toHaveBeenCalled();
  });

  it("leaves a failed read out, so the browser asks again and shows the failure", async () => {
    staff.current = { user: { id: "u1" }, role: "super_admin" };
    readStats.mockRejectedValueOnce(new Error("database down"));
    const keys = (await pageState()).queries.map((q) => q.queryKey[2]);
    expect(keys).toEqual(["infinite"]);
  });
});
