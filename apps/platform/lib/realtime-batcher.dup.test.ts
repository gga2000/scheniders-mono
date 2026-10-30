import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { RealtimeBatcher } from "./realtime-batcher";

/**
 * A new order and the updates that follow it inside one flush are one row.
 * LightFunnels inserts an order and the WhatsApp bot moves it to "contacted"
 * seconds later; when both landed in one batch the row was prepended twice,
 * and the next status change patched only one copy, so the order showed in
 * two status tabs (e.g. contacted AND confirmed) until the page was reloaded.
 */
const KEY = ["orders", "list"] as const;
type Row = Record<string, unknown>;
const order = (id: string, version: number, extra: Row = {}): Row =>
    ({ id, created_at: "2026-09-02T10:00:00.000Z", is_archived: false, status: "new", phone: "07701112222", version, ...extra });

function setup(seed: Row[] = []) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(KEY, seed);
    const batcher = new RealtimeBatcher({ queryClient, queryKey: KEY, flushDelayMs: 1 });
    return { queryClient, batcher, rows: () => (queryClient.getQueryData(KEY) as Row[]) ?? [] };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("RealtimeBatcher — insert followed by updates in one flush", () => {
    it("adds the new order once, carrying its latest status", async () => {
        const { batcher, rows } = setup([order("old", 1)]);
        batcher.push({ eventType: "INSERT", new: order("o1", 1) });
        batcher.push({ eventType: "UPDATE", new: order("o1", 2, { status: "contacted" }) });
        await vi.advanceTimersByTimeAsync(10);

        expect(rows().map((r) => r.id)).toEqual(["o1", "old"]);
        expect(rows()[0]).toMatchObject({ status: "contacted", version: 2 });
    });

    it("a later status change leaves no stale copy in another status", async () => {
        const { batcher, rows } = setup();
        batcher.push({ eventType: "INSERT", new: order("o1", 1) });
        batcher.push({ eventType: "UPDATE", new: order("o1", 2, { status: "contacted" }) });
        await vi.advanceTimersByTimeAsync(10);
        batcher.push({ eventType: "UPDATE", new: order("o1", 3, { status: "confirmed" }) });
        await vi.advanceTimersByTimeAsync(10);

        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toMatchObject({ status: "confirmed", version: 3 });
    });

    it("still adds an update for a row the list did not hold (e.g. un-archived)", async () => {
        const { batcher, rows } = setup([order("old", 1)]);
        batcher.push({ eventType: "UPDATE", new: order("o2", 4, { status: "confirmed" }) });
        await vi.advanceTimersByTimeAsync(10);

        expect(rows().map((r) => r.id)).toEqual(["o2", "old"]);
    });
});
