// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Audit R3-6: Merchants asked for the badges of every loaded shop in one
 * request, and the route takes at most 200. Past 200 loaded shops the request
 * was refused and every badge went. Each page of shops now asks for its own.
 *
 * Round 23 new 3: the chunks followed the order on screen, which floats
 * starred shops up, so starring one asked again for every chunk above it and
 * blanked those badges; a chunk that failed looked like "nobody acted". The
 * chunks now follow the pages the server sent, and a failed one is said.
 *
 * Round 24 structure new 7: a new shop at the top moves one shop from each
 * page to the next, so every page asked again under a new key and every
 * badge went blank until the answers came. Each shop now keeps its badge.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));

const { useLastActors, LAST_ACTORS_CHUNK } = await import("./use-last-actors");
const { useInfiniteMerchants } = await import("./use-infinite-merchants");
const { useAdminStore } = await import("@/store/use-admin-store");

const shopId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asked = () =>
  send.mock.calls
    .filter(([url]) => url === "/api/admin/last-actors")
    .map(([, init]) => (JSON.parse(init.body) as { tenant_ids: string[] }).tenant_ids);
const pagesOf = (ids: string[], size = 50) =>
  Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, (i + 1) * size));
const noRetry = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function serve() {
  send.mockImplementation(async (_url: string, init: RequestInit) => {
    const { tenant_ids } = JSON.parse(String(init.body)) as { tenant_ids: string[] };
    const actors = Object.fromEntries(
      tenant_ids.map((id) => [id, { display_name: "Noor", email: null, avatar_url: null, action: "note", when: "2026-11-22T10:00:00Z", is_system: false }]),
    );
    return new Response(JSON.stringify({ actors }), { status: 200 });
  });
}

afterEach(() => {
  send.mockReset();
  useAdminStore.setState({ starredMerchants: [] });
});

describe("Merchants' last-done-by badges", () => {
  it("gives 250 loaded shops 250 badges, asking at most one page of shops at a time", async () => {
    serve();
    const ids = Array.from({ length: 250 }, (_, i) => shopId(i));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLastActors(pagesOf(ids)), { wrapper });
    await waitFor(() => expect(Object.keys(result.current.actors)).toHaveLength(250));
    expect(asked().every((page) => page.length <= LAST_ACTORS_CHUNK)).toBe(true);
    expect(asked().flat().sort()).toEqual([...ids].sort());
  });

  it("asks only for the new page's shops when one more page loads", async () => {
    serve();
    const first = Array.from({ length: 100 }, (_, i) => shopId(i));
    const more = Array.from({ length: 50 }, (_, i) => shopId(100 + i));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, rerender } = renderHook(({ ids }) => useLastActors(pagesOf(ids)), { wrapper, initialProps: { ids: first } });
    await waitFor(() => expect(Object.keys(result.current.actors)).toHaveLength(100));
    send.mockClear();
    rerender({ ids: [...first, ...more] });
    await waitFor(() => expect(Object.keys(result.current.actors)).toHaveLength(150));
    expect(asked()).toEqual([more]);
  });

  it("keeps every shop's badge while the pages ask again after a new shop moves them", async () => {
    serve();
    const old = Array.from({ length: 100 }, (_, i) => shopId(i));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, rerender } = renderHook(({ ids }) => useLastActors(pagesOf(ids)), { wrapper, initialProps: { ids: old } });
    await waitFor(() => expect(Object.keys(result.current.actors)).toHaveLength(100));
    const answer = send.getMockImplementation();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    send.mockImplementation(async (url: string, init: RequestInit) => {
      await held;
      return answer?.(url, init);
    });
    rerender({ ids: [shopId(999), ...old] });
    await waitFor(() => expect(asked()).toHaveLength(2 + 3));
    expect(Object.keys(result.current.actors).sort()).toEqual([...old].sort());
    expect(result.current.failed).toBe(false);
    act(() => release());
    await waitFor(() => expect(Object.keys(result.current.actors)).toHaveLength(101));
  });

  /*
   * Round 24 data new 2: after a step on the shop page, the shop list was
   * read again but the badges were not, so for up to a minute a badge named
   * the step before the one just done.
   */
  it("asks again whenever the shop list is read again after a change", async () => {
    serve();
    const ids = Array.from({ length: 2 }, (_, i) => shopId(i));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLastActors(pagesOf(ids)), { wrapper });
    await waitFor(() => expect(Object.keys(result.current.actors)).toHaveLength(2));
    send.mockClear();
    await act(() => client.invalidateQueries({ queryKey: ["admin", "merchants"] }));
    await waitFor(() => expect(asked()).toEqual([ids]));
  });

  it("asks nothing when no shop is loaded", () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLastActors([]), { wrapper });
    expect(result.current.actors).toEqual({});
    expect(result.current.failed).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("says when a page of shops' badges could not be read, keeps the others, and asks again for that page only", async () => {
    const first = Array.from({ length: 50 }, (_, i) => shopId(i));
    const second = Array.from({ length: 50 }, (_, i) => shopId(50 + i));
    serve();
    const answer = send.getMockImplementation();
    send.mockImplementation(async (url: string, init: RequestInit) => {
      const { tenant_ids } = JSON.parse(String(init.body)) as { tenant_ids: string[] };
      if (tenant_ids.includes(second[0])) return new Response("{}", { status: 502 });
      return answer?.(url, init);
    });
    const client = noRetry();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLastActors([first, second]), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(Object.keys(result.current.actors).sort()).toEqual([...first].sort());
    serve();
    send.mockClear();
    result.current.retry();
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(asked()).toEqual([second]);
    expect(Object.keys(result.current.actors)).toHaveLength(100);
  });
});

describe("Merchants' badge line while Try again works", () => {
  it("keeps the line and says it is loading until the page of shops answers", async () => {
    const ids = Array.from({ length: 3 }, (_, i) => shopId(i));
    send.mockImplementation(async () => new Response("{}", { status: 503 }));
    const client = noRetry();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLastActors([ids]), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.retrying).toBe(false);

    let answer: () => void = () => undefined;
    serve();
    const served = send.getMockImplementation();
    send.mockImplementation(
      (url: string, init: RequestInit) =>
        new Promise((done) => {
          answer = () => done(served?.(url, init));
        }),
    );
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.retrying).toBe(true));
    expect(result.current.failed).toBe(true);

    await act(async () => answer());
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(result.current.retrying).toBe(false);
    expect(Object.keys(result.current.actors)).toHaveLength(3);
  });
});

/*
 * Round 25 (structure new 3): a page moved by a new shop showed the badges
 * already read only while its read was pending. Once the read failed, the 50
 * badges went blank; Try again brought them back and hid the line, then a
 * second failure blanked them again.
 */
describe("Merchants' badges on a page moved by a new shop whose read fails", () => {
  it("keeps the badges already read, and keeps the line saying it is loading while Try again asks", async () => {
    serve();
    const old = Array.from({ length: 100 }, (_, i) => shopId(i));
    const client = noRetry();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, rerender } = renderHook(({ ids }) => useLastActors(pagesOf(ids)), { wrapper, initialProps: { ids: old } });
    await waitFor(() => expect(Object.keys(result.current.actors)).toHaveLength(100));

    const served = send.getMockImplementation();
    send.mockImplementation(async () => new Response("{}", { status: 503 }));
    rerender({ ids: [shopId(999), ...old] });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(Object.keys(result.current.actors).sort()).toEqual([...old].sort());

    // The three moved pages are asked again; each answer waits until released.
    const held: (() => void)[] = [];
    send.mockImplementation(
      (url: string, init: RequestInit) =>
        new Promise((done) => {
          held.push(() => done(served?.(url, init)));
        }),
    );
    act(() => result.current.retry());
    await waitFor(() => expect(held).toHaveLength(3));
    expect(result.current.retrying).toBe(true);
    expect(result.current.failed).toBe(true);
    expect(Object.keys(result.current.actors).sort()).toEqual([...old].sort());

    await act(async () => held.forEach((release) => release()));
    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(result.current.retrying).toBe(false);
    expect(Object.keys(result.current.actors)).toHaveLength(101);
  });
});

describe("Merchants' badges when a shop is starred", () => {
  it("asks for nothing again when a shop on the second page is starred and moves to the top", async () => {
    const all = Array.from({ length: 100 }, (_, i) => shopId(i));
    send.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/merchants?")) {
        const page = Number(new URL(url, "http://x").searchParams.get("page") ?? "1");
        const merchants = pagesOf(all)[page - 1].map((id) => ({ id }));
        return new Response(JSON.stringify({ merchants, total: all.length, page, limit: 50 }), { status: 200 });
      }
      const { tenant_ids } = JSON.parse(String(init?.body)) as { tenant_ids: string[] };
      const actors = Object.fromEntries(
        tenant_ids.map((id) => [id, { display_name: "Noor", email: null, avatar_url: null, action: "note", when: "2026-11-22T10:00:00Z", is_system: false }]),
      );
      return new Response(JSON.stringify({ actors }), { status: 200 });
    });
    const client = noRetry();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(
      () => {
        const list = useInfiniteMerchants(50);
        return { list, badges: useLastActors(list.pageIds) };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.pageIds).toHaveLength(1));
    await result.current.list.fetchNextPage();
    await waitFor(() => expect(Object.keys(result.current.badges.actors)).toHaveLength(100));
    send.mockClear();
    act(() => useAdminStore.getState().toggleStar(all[70]));
    await waitFor(() => expect(result.current.list.merchants[0].id).toBe(all[70]));
    expect(Object.keys(result.current.badges.actors)).toHaveLength(100);
    expect(asked()).toEqual([]);
  });
});
