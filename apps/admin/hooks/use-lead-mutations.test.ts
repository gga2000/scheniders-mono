// @vitest-environment jsdom
// Build Store's refusals (staff console audit, round 8). After "A store
// already exists" the lead page still offered Build Store until a reload: the
// lead was read again only on success. It is now read again either way, and
// the dialog shows the server's own words.
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const adminFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch }));

import { useBuildStore } from "./use-lead-mutations";

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidated: unknown[] = [];
  vi.spyOn(client, "invalidateQueries").mockImplementation(async (filters) => {
    invalidated.push(filters?.queryKey);
  });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { ...renderHook(() => useBuildStore(), { wrapper }), invalidated };
}

describe("useBuildStore", () => {
  it("reads the lead again after a refusal, and shows the server's words", async () => {
    adminFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "A store already exists for this lead" }), { status: 409 }));
    const { result, invalidated } = setup();

    await act(async () => {
      await result.current.mutateAsync({ leadId: "lead-1", data: {} }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("A store already exists for this lead");
    expect(invalidated).toEqual(expect.arrayContaining([["lead", "lead-1"], ["leads"]]));
    expect(invalidated).not.toContainEqual(["admin", "merchants"]);
  });

  it("falls back to plain words when a refusal has none", async () => {
    adminFetch.mockResolvedValueOnce(new Response("<html>Bad request</html>", { status: 400 }));
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ leadId: "lead-1", data: {} }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.error?.message).toBe("Failed to build store"));
  });

  // Round 25 (structure new 5): a gateway's wordless 502 said "failed", when the store may have been built.
  it("says a gateway's wordless 502 may have built the store, and where to look", async () => {
    adminFetch.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ leadId: "lead-1", data: {} }).catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe("No answer came back, so this may have been done. Check the lead before trying again."),
    );
  });

  it("says a dropped connection may have built the store, not the browser's words", async () => {
    adminFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ leadId: "lead-1", data: {} }).catch(() => undefined);
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe("No answer came back, so this may have been done. Check the lead before trying again."),
    );
  });

  it("reads the lead, the lists and the numbers again after a build", async () => {
    adminFetch.mockResolvedValueOnce(new Response(JSON.stringify({ tenant: { id: "t1", slug: "kawkab" }, store_url: "https://kawkab.usefermi.com" }), { status: 201 }));
    const { result, invalidated } = setup();

    await act(async () => {
      await result.current.mutateAsync({ leadId: "lead-1", data: {} });
    });

    expect(invalidated).toEqual(expect.arrayContaining([["lead", "lead-1"], ["leads"], ["admin", "merchants"], ["lead-analytics"]]));
  });
});
