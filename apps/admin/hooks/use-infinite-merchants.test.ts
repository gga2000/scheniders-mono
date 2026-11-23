// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { AdminTenant } from "@/types/admin";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));

const { patchMerchantInCache, useInfiniteMerchants } = await import("./use-infinite-merchants");

type Page = { merchants: AdminTenant[]; total: number; page: number; limit: number };

const shop = (id: string, status: AdminTenant["status"], plan: AdminTenant["plan"]) =>
  ({ id, status, plan, tags: [] }) as unknown as AdminTenant;

function seeded() {
  const client = new QueryClient();
  const list: InfiniteData<Page> = {
    pages: [{ merchants: [shop("a", "trial", "starter"), shop("b", "active", "internal")], total: 2, page: 1, limit: 50 }],
    pageParams: [1],
  };
  client.setQueryData(["admin", "merchants", "list", { status: null }], list);
  client.setQueryData(["admin", "merchants", "list", { status: "trial" }], {
    pages: [{ merchants: [shop("a", "trial", "starter")], total: 1, page: 1, limit: 50 }],
    pageParams: [1],
  });
  client.setQueryData(["admin", "merchants", "stats"], { total: 2 });
  return client;
}

const statusesOf = (client: QueryClient) =>
  client
    .getQueriesData<InfiniteData<Page>>({ queryKey: ["admin", "merchants", "list"] })
    .map(([, data]) => data?.pages.flatMap((p) => p.merchants.map((m) => `${m.id}:${m.status}:${m.plan}`)));

describe("patchMerchantInCache", () => {
  it("changes the shop in every loaded list and leaves other shops and other queries alone", () => {
    const client = seeded();
    patchMerchantInCache(client, "a", { status: "active" });
    expect(statusesOf(client)).toEqual([["a:active:starter", "b:active:internal"], ["a:active:starter"]]);
    expect(client.getQueryData(["admin", "merchants", "stats"])).toEqual({ total: 2 });
  });

  it("gives back a step that puts every list back when the server refuses the change", () => {
    const client = seeded();
    const before = statusesOf(client);
    const restore = patchMerchantInCache(client, "a", { status: "active", plan: "internal" });
    expect(statusesOf(client)).not.toEqual(before);
    restore();
    expect(statusesOf(client)).toEqual(before);
    expect(statusesOf(client)).toEqual([["a:trial:starter", "b:active:internal"], ["a:trial:starter"]]);
  });
});

/*
 * Round 24 data new 4: "load more" moved the query's own time to the newest
 * page, so after a failed refresh the stale line named that page's time,
 * while the first pages on screen were older.
 */
describe("how old the shop list is", () => {
  afterEach(() => {
    send.mockReset();
    vi.restoreAllMocks();
  });

  it("is as old as its oldest page, not the page loaded last", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    send.mockImplementation(async (url: string) => {
      const page = Number(new URL(url, "http://x").searchParams.get("page") ?? "1");
      const merchants = ids.slice((page - 1) * 50, page * 50).map((id) => ({ id }));
      return new Response(JSON.stringify({ merchants, total: ids.length, page, limit: 50 }), { status: 200 });
    });
    const firstRead = Date.parse("2026-11-22T17:00:00Z");
    const now = vi.spyOn(Date, "now").mockReturnValue(firstRead);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useInfiniteMerchants(50), { wrapper });
    await waitFor(() => expect(result.current.pageIds).toHaveLength(1));
    expect(result.current.dataUpdatedAt).toBe(firstRead);
    now.mockReturnValue(firstRead + 10 * 60_000);
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.pageIds).toHaveLength(2));
    expect(result.current.dataUpdatedAt).toBe(firstRead);
  });
});
