import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";

/**
 * The 30s drift check. It compares the server's newest `updated_at` with what
 * the cache is known to hold: the sync watermark (raised by every complete
 * delta, trashed and out-of-window rows included) or the newest cached row
 * (raised by realtime). Comparing with the cached rows alone saw permanent
 * drift whenever the newest change was a row the cache does not keep — a
 * trashed order, an order outside the date window — and ran a delta every 30s.
 */

const TENANT = "tenant-1";
const H = vi.hoisted(() => ({
    findLatestUpdatedAt: vi.fn(),
    syncOrdersDelta: vi.fn(),
    getSyncWatermark: vi.fn(),
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: { findLatestUpdatedAt: H.findLatestUpdatedAt },
}));
vi.mock("@/hooks/use-orders-query", () => ({
    DELTA_OVERLAP_MS: 120_000,
    orderKeys: { lists: () => ["orders", "list"] },
    syncOrdersDelta: H.syncOrdersDelta,
}));
vi.mock("@/hooks/orders-list-coverage", () => ({ getSyncWatermark: H.getSyncWatermark }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: TENANT }) }));

import { useRealtimeHeartbeat } from "./use-realtime-heartbeat";

const row = (updatedAt: string) => ({ id: updatedAt, updated_at: updatedAt }) as unknown as Order;

async function beat(cache: Order[] | undefined) {
    const qc = new QueryClient();
    if (cache) qc.setQueryData(["orders", "list"], cache);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    renderHook(() => useRealtimeHeartbeat({ intervalMs: 30_000 }), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    return qc;
}

beforeEach(() => {
    vi.useFakeTimers();
    H.findLatestUpdatedAt.mockReset().mockResolvedValue("2026-10-19T08:00:00.000Z");
    H.syncOrdersDelta.mockReset().mockResolvedValue(undefined);
    H.getSyncWatermark.mockReset().mockReturnValue(null);
});
afterEach(() => vi.useRealTimers());

describe("realtime heartbeat drift", () => {
    it("reads the same tenant-wide mark the delta covers", async () => {
        await beat([row("2026-10-19T08:00:00.000Z")]);
        expect(H.findLatestUpdatedAt).toHaveBeenCalledWith(TENANT);
    });

    it("no drift when the watermark already covers the server's newest change (a trashed or out-of-window row)", async () => {
        H.getSyncWatermark.mockReturnValue({ at: "2026-10-19T08:00:00.000Z", fromFetch: false });
        await beat([row("2026-10-12T08:00:00.000Z")]);
        expect(H.syncOrdersDelta).not.toHaveBeenCalled();
    });

    it("no drift when realtime already brought the newest change into the cache", async () => {
        H.getSyncWatermark.mockReturnValue({ at: "2026-10-19T07:00:00.000Z", fromFetch: false });
        await beat([row("2026-10-19T08:00:00.000Z")]);
        expect(H.syncOrdersDelta).not.toHaveBeenCalled();
    });

    it("drift when the server is ahead of both: one delta", async () => {
        H.getSyncWatermark.mockReturnValue({ at: "2026-10-19T07:00:00.000Z", fromFetch: false });
        const qc = await beat([row("2026-10-19T07:30:00.000Z")]);
        expect(H.syncOrdersDelta).toHaveBeenCalledTimes(1);
        expect(H.syncOrdersDelta).toHaveBeenCalledWith(qc, TENANT, "heartbeatDrift");
    });

    it("a fetch mark still owes its overlap: a delta runs even when it equals the server's newest change", async () => {
        // A delta that finished during the fetch can have been replaced by the
        // fetch's older read, and a write stamped before the mark can commit
        // after it: the mark alone does not prove the cache holds either.
        H.getSyncWatermark.mockReturnValue({ at: "2026-10-19T08:00:00.000Z", fromFetch: true });
        await beat([row("2026-10-12T08:00:00.000Z")]);
        expect(H.syncOrdersDelta).toHaveBeenCalledTimes(1);
    });

    it("once a delta has run from it, the same mark is no drift", async () => {
        H.getSyncWatermark.mockReturnValue({ at: "2026-10-19T08:00:00.000Z", fromFetch: false });
        await beat([row("2026-10-12T08:00:00.000Z")]);
        expect(H.syncOrdersDelta).not.toHaveBeenCalled();
    });

    it("an empty (loaded) window still compares against the watermark", async () => {
        H.getSyncWatermark.mockReturnValue({ at: "2026-10-19T07:00:00.000Z", fromFetch: false });
        await beat([]);
        expect(H.syncOrdersDelta).toHaveBeenCalledTimes(1);
    });

    it("nothing loaded yet: no delta", async () => {
        await beat(undefined);
        expect(H.syncOrdersDelta).not.toHaveBeenCalled();
    });

    it("a failed read runs no delta and does not throw", async () => {
        H.findLatestUpdatedAt.mockRejectedValue(new Error("network"));
        await beat([row("2026-10-19T07:30:00.000Z")]);
        expect(H.syncOrdersDelta).not.toHaveBeenCalled();
    });
});
