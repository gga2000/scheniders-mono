// @vitest-environment jsdom
// Support writes are sent once (staff console audit, round 22, N8). A reply
// whose answer was lost used to be sent again when staff pressed Send twice.
// Each send now carries an id kept until it goes through, and the database
// writes once per id.
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const adminFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch }));

import { SUPPORT_SEND_UNSURE } from "@/lib/support";
import { useSupportCaseAction, useSupportLogShopCall } from "./use-support-cases";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

/** The bodies sent, in order. */
function sent(): Record<string, unknown>[] {
  return adminFetch.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>);
}

const ok = () => new Response(JSON.stringify({ success: true }), { status: 200 });

beforeEach(() => adminFetch.mockReset());

describe("a reply is sent once however often Send is pressed", () => {
  it("keeps the id after a lost answer, then starts a new one after it goes through", async () => {
    adminFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("<html>Gateway Timeout</html>", { status: 504 }))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    const { result } = renderHook(() => useSupportCaseAction("case-1"), { wrapper });
    const reply = { action: "reply", body: "on it" } as const;

    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await expect(result.current.mutateAsync(reply)).rejects.toThrow(SUPPORT_SEND_UNSURE);
      });
    }
    await act(async () => {
      await result.current.mutateAsync(reply);
    });
    await act(async () => {
      await result.current.mutateAsync(reply);
    });

    const ids = sent().map((body) => body.request_id);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).toBe(ids[0]);
    expect(ids[3]).not.toBe(ids[0]);
  });

  it("reads the route's own lost answer as the shared words and keeps the id (round 23)", async () => {
    adminFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: SUPPORT_SEND_UNSURE }), { status: 502 }))
      .mockResolvedValueOnce(ok());
    const { result } = renderHook(() => useSupportCaseAction("case-1"), { wrapper });
    const reply = { action: "reply", body: "on it" } as const;

    await act(async () => {
      const failure = result.current.mutateAsync(reply);
      await expect(failure).rejects.toThrow(SUPPORT_SEND_UNSURE);
    });
    await act(async () => {
      await result.current.mutateAsync(reply);
    });

    const [first, second] = sent();
    expect(second?.request_id).toBe(first?.request_id);
  });

  it("gives other words their own id, and sends no id with a solve", async () => {
    adminFetch.mockImplementation(async () => new Response(JSON.stringify({ error: "nope" }), { status: 409 }));
    const { result } = renderHook(() => useSupportCaseAction("case-1"), { wrapper });

    for (const ask of [
      { action: "reply", body: "one" },
      { action: "reply", body: "two" },
      { action: "note", body: "one" },
      { action: "solve", reason: "orders" },
    ] as const) {
      await act(async () => {
        await expect(result.current.mutateAsync(ask)).rejects.toThrow("nope");
      });
    }

    const [one, two, note, solve] = sent();
    expect(one?.request_id).not.toBe(two?.request_id);
    expect(note?.request_id).not.toBe(one?.request_id);
    expect(solve).toEqual({ action: "solve", reason: "orders" });
  });
});

describe("Mark contacted on Trials logs one call per press that went through", () => {
  it("sends the same id again after a lost answer", async () => {
    adminFetch.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok());
    const { result } = renderHook(() => useSupportLogShopCall(), { wrapper });
    const call = { tenantId: "33333333-3333-4333-8333-333333333333", outcome: "done" } as const;

    await act(async () => {
      await expect(result.current.mutateAsync(call)).rejects.toThrow(SUPPORT_SEND_UNSURE);
    });
    await act(async () => {
      await result.current.mutateAsync(call);
    });

    const [first, second] = sent();
    expect(second?.request_id).toBe(first?.request_id);
  });
});
