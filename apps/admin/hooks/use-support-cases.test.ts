// @vitest-environment jsdom
// Support writes are sent once (staff console audit, round 22, N8). A reply
// whose answer was lost used to be sent again when staff pressed Send twice.
// Each send now carries an id kept until it goes through, and the database
// writes once per id.
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

const adminFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch }));

import { SUPPORT_NOTICE_END_UNSURE, SUPPORT_SEND_UNSURE, SUPPORT_VIEW_UNSURE } from "@/lib/support";
import {
  useSupportCaseAction,
  useSupportLogShopCall,
  useSupportNoticeEnd,
  useSupportTakeShop,
  useSupportViewStart,
} from "./use-support-cases";

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

/*
 * Round 24 (UX new 3): a send stayed "sending" until every support read on the
 * page had re-read, so a slow scoreboard kept a sent reply spinning. It now
 * waits only on its own conversation; the rest re-read on their own.
 */
describe("a send ends when its own read lands", () => {
  it("settles once the conversation re-reads, while a slow panel is still reading", async () => {
    adminFetch.mockImplementation(async () => ok());
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const own = vi.fn(async () => ({ messages: 1 }));
    let boardReads = 0;
    const board = vi.fn(() => {
      boardReads += 1;
      return boardReads === 1 ? Promise.resolve({ rows: 1 }) : new Promise<{ rows: number }>(() => undefined);
    });
    const { result } = renderHook(
      () => {
        useQuery({ queryKey: ["admin", "support", "case", "case-1"], queryFn: own });
        useQuery({ queryKey: ["admin", "support", "scoreboard", 7], queryFn: board });
        return useSupportCaseAction("case-1");
      },
      { wrapper: ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children) },
    );
    await waitFor(() => expect(board).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.mutateAsync({ action: "reply", body: "on it" });
    });
    expect(own).toHaveBeenCalledTimes(2);
    expect(board).toHaveBeenCalledTimes(2);
    expect(result.current.isPending).toBe(false);
  });
});

/*
 * Round 24 (structure new 5): ending a notice, taking a shop and opening or
 * ending a merchant view posted outside the one sender, so a dropped
 * connection read "Failed to fetch". Ending again could end a teammate's new
 * notice, so its lost answer says to look first.
 */
describe("the steps with no id say a lost answer may have gone through", () => {
  it("tells staff to check the notice bar before ending again", async () => {
    adminFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useSupportNoticeEnd(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow(SUPPORT_NOTICE_END_UNSURE);
    });
    expect(adminFetch.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("says a look may have opened when its link never came back", async () => {
    adminFetch.mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const { result } = renderHook(() => useSupportViewStart(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync("33333333-3333-4333-8333-333333333333")).rejects.toThrow(SUPPORT_VIEW_UNSURE);
    });
  });

  it("passes on the route's own refusal words", async () => {
    adminFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "This shop is gone." }), { status: 404 }));
    const { result } = renderHook(() => useSupportTakeShop(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync("33333333-3333-4333-8333-333333333333")).rejects.toThrow("This shop is gone.");
    });
  });
});
