// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

/*
 * Round 15 (Speed): the shell's eight badge and alarm reads started with the
 * page's own reads, and every page's data landed about 0.5 to 1 s later than
 * it does alone. They now start once the page's own reads have landed.
 */

const adminFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch }));

import { useBillingCheck } from "@/components/shared/billing-check-alert";
import { useHourlyJobs } from "@/components/shared/hourly-jobs-alert";
import { usePrimeLinkRequests } from "@/components/shared/prime-link-requests-section";
import { useTopupRequests } from "@/components/shared/topup-requests-section";
import { useWhatsAppHealth } from "@/components/shared/whatsapp-health-alert";
import { useLeadsWithNoOwner } from "@/hooks/use-leads";
import { useRecentSteps } from "@/hooks/use-recent-steps";
import { useSupportWaitingCount } from "@/hooks/use-support-cases";
import { TOPUP_QUEUE_KEY } from "@/lib/topup-queue";
import { SHELL_READ_DEADLINE_MS } from "./use-after-page-reads";

/** What each shell read is answered with, by address. */
const SHELL_ANSWERS: Record<string, unknown> = {
  "/api/activity": { logs: [] },
  "/api/leads/no-owner": { noOwner: 0 },
  "/api/support/cases": { waitingOnUs: 0 },
  "/api/wallet-topup-requests": { requests: [] },
  "/api/prime-link-requests": { requests: [] },
  "/api/whatsapp-health": { interaktEmpty: false, since: null, pausedShops: 0 },
  "/api/billing-check": { trialsNotBilled: [], renewalsMissed: [] },
  "/api/hourly-jobs": { pausesNotLifted: [], jobs: [] },
};
const SHELL_PATHS = Object.keys(SHELL_ANSWERS).sort();

/** The addresses asked so far, by both fetchers, without their query strings. */
const asked: string[] = [];
const answer = async (url: string) => {
  const path = url.split("?")[0];
  asked.push(path);
  return new Response(JSON.stringify(SHELL_ANSWERS[path] ?? {}), { status: 200 });
};
const shellAsked = () => [...new Set(asked.filter((path) => path in SHELL_ANSWERS))].sort();

function useShell() {
  useRecentSteps();
  useLeadsWithNoOwner();
  useSupportWaitingCount();
  useTopupRequests();
  usePrimeLinkRequests();
  useWhatsAppHealth();
  useBillingCheck();
  useHourlyJobs();
}

/** A page read that answers when the test says. */
function pageRead() {
  let land: (value: string) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const promise = new Promise<string>((resolve, reject) => {
    land = resolve;
    fail = reject;
  });
  return { usePage: () => useQuery({ queryKey: ["page", "own"], queryFn: () => promise, retry: false }), land, fail };
}

function render(usePage: () => unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(
    () => {
      useShell();
      usePage();
    },
    { wrapper },
  );
}

beforeEach(() => {
  asked.length = 0;
  adminFetch.mockReset();
  adminFetch.mockImplementation(answer);
  vi.stubGlobal("fetch", vi.fn(answer));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the shell's badge and alarm reads", () => {
  it("wait while the page's own read runs, and all start once it has landed", async () => {
    const page = pageRead();
    render(page.usePage);
    await act(async () => {});
    expect(shellAsked()).toEqual([]);

    await act(async () => page.land("the page's rows"));
    await waitFor(() => expect(shellAsked()).toEqual(SHELL_PATHS));
  });

  it("start too when the page's read fails", async () => {
    const page = pageRead();
    render(page.usePage);
    await act(async () => page.fail(new Error("Could not load")));
    await waitFor(() => expect(shellAsked()).toEqual(SHELL_PATHS));
  });

  it("do not hold up a page that reads one of them itself (Payments), and the badge fills from its answer", async () => {
    const usePayments = () =>
      useQuery({
        queryKey: TOPUP_QUEUE_KEY,
        queryFn: async () => (await (await adminFetch("/api/wallet-topup-requests")).json()).requests,
      });
    render(usePayments);
    await waitFor(() => expect(asked).toContain("/api/wallet-topup-requests"));
    await waitFor(() => expect(shellAsked()).toEqual(SHELL_PATHS));
  });

  it("start at the latest a few seconds in, on a page that reads nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(() => null);
    await act(async () => vi.advanceTimersByTimeAsync(SHELL_READ_DEADLINE_MS - 100));
    expect(shellAsked()).toEqual([]);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(shellAsked()).toEqual(SHELL_PATHS);
  });
});
