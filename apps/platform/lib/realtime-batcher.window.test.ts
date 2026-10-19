import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { RealtimeBatcher } from "./realtime-batcher";
import { windowFromDateFilter } from "./order-window";

/**
 * PERF-1 stage D. Once the order fetch is windowed, the realtime batcher can no
 * longer assume the cache is the complete set. These cover the three ways that
 * assumption breaks a merchant's list.
 */
const KEY = ["orders", "list"] as const;
const IN_WINDOW = "2026-09-02T10:00:00.000Z";   // inside 2026-09-02 Baghdad
const OUT_OF_WINDOW = "2026-09-20T10:00:00.000Z";

const order = (id: string, created_at: string, extra: Record<string, unknown> = {}) =>
    ({ id, created_at, is_archived: false, status: "new", ...extra });

function setup(windowed: boolean, seed: unknown[]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(KEY, seed);
    const batcher = new RealtimeBatcher({
        queryClient,
        queryKey: KEY,
        flushDelayMs: 1,
        getWindow: () => (windowed ? windowFromDateFilter("2026-09-02", "2026-09-02") : null),
    });
    return { queryClient, batcher };
}
const rows = (qc: QueryClient) => (qc.getQueryData(KEY) as { id: string }[]) ?? [];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RealtimeBatcher window awareness", () => {
    it("prepends an INSERT that belongs in the window", async () => {
        const { queryClient, batcher } = setup(true, [order("existing", IN_WINDOW)]);
        batcher.push({ eventType: "INSERT", new: order("fresh", IN_WINDOW) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id)).toContain("fresh");
    });

    it("does NOT prepend an INSERT from outside the window", async () => {
        // The phantom case: an order the merchant's filter excludes appearing in
        // their list, where it can be selected and acted on.
        const { queryClient, batcher } = setup(true, [order("existing", IN_WINDOW)]);
        batcher.push({ eventType: "INSERT", new: order("elsewhere", OUT_OF_WINDOW) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id)).toEqual(["existing"]);
    });

    it("does NOT conjure a row from an UPDATE for an order that was never loaded", async () => {
        const { queryClient, batcher } = setup(true, [order("existing", IN_WINDOW)]);
        batcher.push({ eventType: "UPDATE", new: order("unloaded", OUT_OF_WINDOW) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id)).toEqual(["existing"]);
    });

    it("removes a loaded row that is edited out of the window", async () => {
        const { queryClient, batcher } = setup(true, [order("moving", IN_WINDOW)]);
        batcher.push({ eventType: "UPDATE", new: order("moving", OUT_OF_WINDOW, { version: 2 }) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id)).toEqual([]);
    });

    it("keeps today's behaviour when the cache is complete (no window)", async () => {
        // Guards against this change altering anything before stage C lands.
        const { queryClient, batcher } = setup(false, [order("existing", IN_WINDOW)]);
        batcher.push({ eventType: "INSERT", new: order("elsewhere", OUT_OF_WINDOW) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id).sort()).toEqual(["elsewhere", "existing"]);
    });
});

/**
 * The orders channel is filtered on tenant_id (postgres_changes takes a single
 * filter), so archived rows now reach the batcher and it alone keeps them out of
 * the active list.
 */
describe("RealtimeBatcher archived rows", () => {
    it("neither prepends nor notifies an archived INSERT", async () => {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        queryClient.setQueryData(KEY, [order("existing", IN_WINDOW)]);
        const onNewOrder = vi.fn();
        const batcher = new RealtimeBatcher({ queryClient, queryKey: KEY, flushDelayMs: 1, onNewOrder });
        batcher.push({ eventType: "INSERT", new: order("archived", IN_WINDOW, { is_archived: true }) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id)).toEqual(["existing"]);
        expect(onNewOrder).not.toHaveBeenCalled();
    });

    it("removes a loaded row when an UPDATE archives it", async () => {
        const { queryClient, batcher } = setup(false, [order("existing", IN_WINDOW), order("kept", IN_WINDOW)]);
        batcher.push({ eventType: "UPDATE", new: order("existing", IN_WINDOW, { is_archived: true, version: 2 }) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id)).toEqual(["kept"]);
    });

    it("does not add an archived row that was never loaded", async () => {
        const { queryClient, batcher } = setup(false, [order("existing", IN_WINDOW)]);
        batcher.push({ eventType: "UPDATE", new: order("unloaded", IN_WINDOW, { is_archived: true }) } as never);
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map(o => o.id)).toEqual(["existing"]);
    });
});
