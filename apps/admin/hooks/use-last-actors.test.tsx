// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Audit R3-6: Merchants asked for the badges of every loaded shop in one
 * request, and the route takes at most 200. Past 200 loaded shops the request
 * was refused and every badge went. Each page of shops now asks for its own.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));

const { useLastActors, LAST_ACTORS_CHUNK } = await import("./use-last-actors");

const shopId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asked = () => send.mock.calls.map(([, init]) => (JSON.parse(init.body) as { tenant_ids: string[] }).tenant_ids);

function serve() {
  send.mockImplementation(async (_url: string, init: RequestInit) => {
    const { tenant_ids } = JSON.parse(String(init.body)) as { tenant_ids: string[] };
    const actors = Object.fromEntries(
      tenant_ids.map((id) => [id, { display_name: "Noor", email: null, avatar_url: null, action: "note", when: "2026-11-22T10:00:00Z", is_system: false }]),
    );
    return new Response(JSON.stringify({ actors }), { status: 200 });
  });
}

afterEach(() => send.mockReset());

describe("Merchants' last-done-by badges", () => {
  it("gives 250 loaded shops 250 badges, asking at most one page of shops at a time", async () => {
    serve();
    const ids = Array.from({ length: 250 }, (_, i) => shopId(i));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLastActors(ids), { wrapper });
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(250));
    expect(asked().every((page) => page.length <= LAST_ACTORS_CHUNK)).toBe(true);
    expect(asked().flat().sort()).toEqual([...ids].sort());
  });

  it("asks only for the new page's shops when one more page loads", async () => {
    serve();
    const first = Array.from({ length: 100 }, (_, i) => shopId(i));
    const more = Array.from({ length: 50 }, (_, i) => shopId(100 + i));
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result, rerender } = renderHook(({ ids }) => useLastActors(ids), { wrapper, initialProps: { ids: first } });
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(100));
    send.mockClear();
    rerender({ ids: [...first, ...more] });
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(150));
    expect(asked()).toEqual([more]);
  });

  it("asks nothing when no shop is loaded", () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLastActors([]), { wrapper });
    expect(result.current).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });
});
