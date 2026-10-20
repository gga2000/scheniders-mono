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

    it("a delta row carrying deleted_at removes the cached row, even while it is guarded", () => {
        const { queryClient, batcher } = setup([order("o1", 4), order("o2", 1)]);
        batcher.markMutated("o1", 4);
        batcher.applyChangedOrders([{ ...order("o1", 5), deleted_at: "2026-10-19T08:00:00.000Z" } as unknown as Order]);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["o2"]);
    });

    it("a trashed delta row is never added", () => {
        const { queryClient, batcher } = setup([order("o2", 1)]);
        batcher.applyChangedOrders([{ ...order("o1", 5), deleted_at: "2026-10-19T08:00:00.000Z" } as unknown as Order]);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["o2"]);
    });

    it("a trashed delta row older than the cached copy (restored since) does not remove it", () => {
        const { queryClient, batcher } = setup([order("o1", 8)]);
        batcher.applyChangedOrders([{ ...order("o1", 7), deleted_at: "2026-10-19T08:00:00.000Z" } as unknown as Order]);
        expect(byId(queryClient, "o1")?.version).toBe(8);
    });

    it("live delta rows enter the list without the deleted_at column", () => {
        const { queryClient, batcher } = setup([order("o1", 4)]);
        batcher.applyChangedOrders([
            { ...order("o1", 5), deleted_at: null } as unknown as Order,
            { ...order("o3", 1), deleted_at: null } as unknown as Order,
        ]);
        expect(rows(queryClient).map((r) => r.id).sort()).toEqual(["o1", "o3"]);
        for (const r of rows(queryClient)) expect(r).not.toHaveProperty("deleted_at");
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

describe("a delta read before a realtime removal", () => {
    // The catch-up delta reads the row, realtime then removes it, and only then
    // does the delta apply. The row is no longer cached, so no version check
    // can run against it: the removal itself must be remembered.
    const asOrder = (r: Row) => r as unknown as Order;

    it("does not bring back a row a peer trashed after the delta read it", async () => {
        const { queryClient, batcher } = setup([order("x", 5), order("y", 1)], { stripping: true });
        batcher.push({ eventType: "UPDATE", new: { ...order("x", 6), deleted_at: "2026-10-20T08:00:06.000Z" } });
        await vi.advanceTimersByTimeAsync(10);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["y"]);
        expect(batcher.applyChangedOrders([asOrder(order("x", 5))])).toBe(0);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["y"]);
    });

    it("does not bring back a row a peer archived after the delta read it", async () => {
        const { queryClient, batcher } = setup([order("x", 5), order("y", 1)]);
        batcher.push({ eventType: "UPDATE", new: order("x", 6, { is_archived: true }) });
        await vi.advanceTimersByTimeAsync(10);
        batcher.applyChangedOrders([asOrder(order("x", 5))]);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["y"]);
    });

    it("does not bring back a hard-deleted row (DELETE carries no version)", async () => {
        const { queryClient, batcher } = setup([order("x", 5), order("y", 1)]);
        batcher.push({ eventType: "DELETE", old: { id: "x" } });
        await vi.advanceTimersByTimeAsync(10);
        batcher.applyChangedOrders([asOrder(order("x", 5))]);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["y"]);
    });

    it("does not bring back a row realtime moved out of the window", async () => {
        const { queryClient, batcher } = setup([order("x", 5), order("y", 1)], { windowed: true });
        batcher.push({ eventType: "UPDATE", new: order("x", 6, { created_at: OTHER_DAY }) });
        await vi.advanceTimersByTimeAsync(10);
        batcher.applyChangedOrders([asOrder(order("x", 5))]);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["y"]);
    });

    it("a removal also counts when the row was never cached", async () => {
        const { queryClient, batcher } = setup([order("y", 1)]);
        batcher.push({ eventType: "UPDATE", new: { ...order("x", 6), deleted_at: "2026-10-20T08:00:06.000Z" } });
        await vi.advanceTimersByTimeAsync(10);
        batcher.applyChangedOrders([asOrder(order("x", 5))]);
        expect(rows(queryClient).map((r) => r.id)).toEqual(["y"]);
    });

    it("a version newer than the removal (restored since) is added", async () => {
        const { queryClient, batcher } = setup([order("x", 5), order("y", 1)]);
        batcher.push({ eventType: "UPDATE", new: { ...order("x", 6), deleted_at: "2026-10-20T08:00:06.000Z" } });
        await vi.advanceTimersByTimeAsync(10);
        batcher.applyChangedOrders([asOrder(order("x", 7))]);
        expect(rows(queryClient).map((r) => r.id).sort()).toEqual(["x", "y"]);
    });

    it("the removal is forgotten once no delta in flight can predate it", async () => {
        const { batcher } = setup([order("x", 5), order("y", 1)]);
        batcher.push({ eventType: "UPDATE", new: { ...order("x", 6), deleted_at: "2026-10-20T08:00:06.000Z" } });
        await vi.advanceTimersByTimeAsync(10);
        expect(batcher.removedSince(asOrder(order("x", 5)))).toBe(true);
        await vi.advanceTimersByTimeAsync(RealtimeBatcher.REMOVAL_MEMORY_MS + 1);
        expect(batcher.removedSince(asOrder(order("x", 5)))).toBe(false);
    });

    it("only a trash, delete or archive is tenant-wide; a window drop is not", async () => {
        const { batcher } = setup([order("x", 5), order("z", 5)], { windowed: true });
        batcher.push({ eventType: "UPDATE", new: order("x", 6, { created_at: OTHER_DAY }) });
        batcher.push({ eventType: "UPDATE", new: { ...order("z", 6), deleted_at: "2026-10-20T08:00:06.000Z" } });
        await vi.advanceTimersByTimeAsync(10);
        expect(batcher.removedSince(asOrder(order("x", 5)), { tenantWide: true })).toBe(false);
        expect(batcher.removedSince(asOrder(order("z", 5)), { tenantWide: true })).toBe(true);
    });

    it("an archived delta row older than the cached copy (unarchived since) does not remove it", () => {
        const { queryClient, batcher } = setup([order("x", 6)]);
        batcher.applyChangedOrders([asOrder(order("x", 5, { is_archived: true }))]);
        expect(byId(queryClient, "x")?.version).toBe(6);
    });
});
