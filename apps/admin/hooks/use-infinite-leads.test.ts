// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));

const { useInfiniteLeads } = await import("./use-infinite-leads");

/*
 * Round 24 data new 4 stamped each page of the phone's lead list with its
 * read time, so after "load more" the list is as old as its oldest page.
 * Round 25 (structure new 6): only Merchants had a test that checks the time.
 */
describe("how old the phone's lead list is", () => {
  afterEach(() => {
    send.mockReset();
    vi.restoreAllMocks();
  });

  it("is as old as its oldest page, not the page loaded last", async () => {
    send.mockImplementation(async (url: string) => {
      const page = Number(new URL(url, "http://x").searchParams.get("page") ?? "1");
      const leads = Array.from({ length: 20 }, (_, i) => ({ id: `lead-${page}-${i}` }));
      return new Response(JSON.stringify({ leads, total: 40, page, limit: 20 }), { status: 200 });
    });
    const firstRead = Date.parse("2026-11-22T17:00:00Z");
    const now = vi.spyOn(Date, "now").mockReturnValue(firstRead);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useInfiniteLeads(), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.dataUpdatedAt).toBe(firstRead);

    now.mockReturnValue(firstRead + 10 * 60_000);
    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.dataUpdatedAt).toBe(firstRead);
  });
});
