import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Order } from "@/types/order";
import { pickListColumns } from "@/lib/repositories/order-columns";
import { RealtimeBatcher } from "./realtime-batcher";
import { windowFromDateFilter } from "./order-window";

/**
 * The batcher rules the status catch-up relies on once the 2s full refetch is
 * gone: a version-aware mutation guard (our echo is skipped, the history
 * trigger's second write applies), replay of a skipped event when our write
 * fails, live soft-delete removal, and risk_data surviving a realtime replace.
 */
const KEY = ["orders", "list"] as const;
const DAY = "2026-09-02T10:00:00.000Z";
const OTHER_DAY = "2026-09-20T10:00:00.000Z";

type Row = Record<string, unknown>;
const order = (id: string, version: number, extra: Row = {}): Row =>
    ({ id, created_at: DAY, is_archived: false, status: "new", phone: "07701112222", version, ...extra });

function setup(seed: Row[], { windowed = false, stripping = false } = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(KEY, seed);
    const batcher = new RealtimeBatcher({
        queryClient,
        queryKey: KEY,
        flushDelayMs: 1,
        // The production normalizer projects to LIST_COLUMNS, dropping deleted_at.
        normalizer: stripping ? (raw) => pickListColumns(raw as Row) : undefined,
        getWindow: () => (windowed ? windowFromDateFilter("2026-09-02", "2026-09-02") : null),
    });
    return { queryClient, batcher };
}
const rows = (qc: QueryClient) => (qc.getQueryData(KEY) as Row[]) ?? [];
const byId = (qc: QueryClient, id: string) => rows(qc).find((r) => r.id === id);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("version-aware mutation guard", () => {
    it("skips our PATCH echo (base+1) and applies the history trigger's write (base+2)", async () => {
        const { queryClient, batcher } = setup([order("o1", 4)]);
        batcher.markMutated("o1", 4);
        batcher.push({ eventType: "UPDATE", new: order("o1", 5, { status: "confirmed" }) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")?.version).toBe(4);

        batcher.push({ eventType: "UPDATE", new: order("o1", 6, { status: "confirmed", last_status_changed_by_name: "Staff" }) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")).toMatchObject({ version: 6, last_status_changed_by_name: "Staff" });
    });

    it("without a base version it skips every update for the guard window, as before", async () => {
        const { queryClient, batcher } = setup([order("o1", 4)]);
        batcher.markMutated("o1");
        batcher.push({ eventType: "UPDATE", new: order("o1", 9) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")?.version).toBe(4);
        // After the guard expires, updates apply again.
        await vi.advanceTimersByTimeAsync(3_100);
        batcher.push({ eventType: "UPDATE", new: order("o1", 10) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")?.version).toBe(10);
    });

    it("the same rule applies to delta rows", () => {
        const { queryClient, batcher } = setup([order("o1", 4)]);
        batcher.markMutated("o1", 4);
        batcher.applyChangedOrders([order("o1", 5) as unknown as Order]);
        expect(byId(queryClient, "o1")?.version).toBe(4);
        batcher.applyChangedOrders([order("o1", 6) as unknown as Order]);
        expect(byId(queryClient, "o1")?.version).toBe(6);
    });
});

describe("releaseGuard", () => {
    it("replay re-applies the skipped event (our write failed, so it was a peer's)", async () => {
        const { queryClient, batcher } = setup([order("o1", 4)]);
        batcher.markMutated("o1", 4);
        batcher.push({ eventType: "UPDATE", new: order("o1", 5, { status: "cancelled" }) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")?.version).toBe(4);

        batcher.releaseGuard("o1", { replay: true });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")).toMatchObject({ version: 5, status: "cancelled" });
    });

    it("replays a held delta row too", () => {
        const { queryClient, batcher } = setup([order("o1", 4)]);
        batcher.markMutated("o1", 4);
        batcher.applyChangedOrders([order("o1", 5) as unknown as Order]);
        batcher.releaseGuard("o1", { replay: true });
        expect(byId(queryClient, "o1")?.version).toBe(5);
    });

    it("without replay drops it (a conflict refetch supersedes it)", async () => {
        const { queryClient, batcher } = setup([order("o1", 4)]);
        batcher.markMutated("o1", 4);
        batcher.push({ eventType: "UPDATE", new: order("o1", 5) });
        await vi.advanceTimersByTimeAsync(10);
        batcher.releaseGuard("o1", { replay: false });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")?.version).toBe(4);
        // The guard is gone: the next update applies.
        batcher.push({ eventType: "UPDATE", new: order("o1", 6) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")?.version).toBe(6);
    });
});

describe("live soft deletes", () => {
    it("removes a row whose UPDATE carries deleted_at, even through a normalizer that strips it", async () => {
        const { queryClient, batcher } = setup([order("o1", 4), order("o2", 1)], { stripping: true });
        batcher.push({ eventType: "UPDATE", new: { ...order("o1", 5), deleted_at: "2026-10-19T08:00:00.000Z", tenant_id: "t" } });
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["o2"]);
    });

    it("removes it while the row is guarded", async () => {
        const { queryClient, batcher } = setup([order("o1", 4)], { stripping: true });
        batcher.markMutated("o1", 4);
        batcher.push({ eventType: "UPDATE", new: { ...order("o1", 5), deleted_at: "2026-10-19T08:00:00.000Z" } });
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient)).toEqual([]);
    });

    it("keeps admitting a restore from the trash (deleted_at null)", async () => {
        const { queryClient, batcher } = setup([], { stripping: true });
        batcher.push({ eventType: "UPDATE", new: { ...order("o1", 7), deleted_at: null, tenant_id: "t" } });
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["o1"]);
    });
});

describe("risk_data across a realtime replace", () => {
    const risk = { level: "high", score: 10 };

    it("is carried over while the phone is unchanged", async () => {
        const { queryClient, batcher } = setup([order("o1", 4, { risk_data: risk })], { stripping: true });
        batcher.push({ eventType: "UPDATE", new: order("o1", 5, { status: "confirmed" }) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")).toMatchObject({ status: "confirmed", risk_data: risk });
    });

    it("is dropped when the phone changed (risk is keyed by phone)", async () => {
        const { queryClient, batcher } = setup([order("o1", 4, { risk_data: risk })], { stripping: true });
        batcher.push({ eventType: "UPDATE", new: order("o1", 5, { phone: "07709998888" }) });
        await vi.advanceTimersByTimeAsync(10);
        expect(byId(queryClient, "o1")?.risk_data).toBeUndefined();
    });
});

describe("applyChangedOrders and the window", () => {
    it("drops a loaded row a delta shows has moved out of the window", () => {
        const { queryClient, batcher } = setup([order("o1", 4), order("o2", 1)], { windowed: true });
        batcher.applyChangedOrders([order("o1", 5, { created_at: OTHER_DAY }) as unknown as Order]);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["o2"]);
    });

    it("keeps a row when the delta's copy is older than the cache", () => {
        const { queryClient, batcher } = setup([order("o1", 6)], { windowed: true });
        batcher.applyChangedOrders([order("o1", 5, { created_at: OTHER_DAY }) as unknown as Order]);
        expect(byId(queryClient, "o1")?.version).toBe(6);
    });
});
