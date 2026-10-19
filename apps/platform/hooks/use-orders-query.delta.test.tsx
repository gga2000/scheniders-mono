import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Order } from "@/types/order";
import type { OrderWindow } from "@/lib/order-window";
import { RealtimeBatcher } from "@/lib/realtime-batcher";

/**
 * The catch-up delta that replaces the 2s full refetch. Its start point is the
 * sync watermark: the tenant-wide high-water mark read BEFORE the last list
 * fetch (minus a one-time overlap), then each complete delta's newest row
 * (minus a small skew). A delta that hits PostgREST's 1,000-row cap may be
 * missing rows, so it never advances the watermark and the list is refetched.
 */

const TENANT = "tenant-1";
const H = vi.hoisted(() => ({
    findWindow: vi.fn(),
    findLatestUpdatedAt: vi.fn(),
    findChangedSince: vi.fn(),
    tenantId: "tenant-1" as string | null,
}));

vi.mock("@/lib/repositories/order-repository", () => ({
    orderRepository: {
        findWindow: H.findWindow,
        findLatestUpdatedAt: H.findLatestUpdatedAt,
        findChangedSince: H.findChangedSince,
    },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ session: { access_token: "t" }, clientReady: true, tenantId: H.tenantId }),
}));
vi.mock("@/app/actions/orders", () => ({ createOrderAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
    DELTA_OVERLAP_MS,
    DELTA_ROW_CAP,
    DELTA_SKEW_MS,
    orderKeys,
    requestOrdersCatchUp,
    setOrderBatcher,
    syncOrdersDelta,
    useOrdersQuery,
} from "./use-orders-query";
import { getSyncWatermark } from "./orders-list-coverage";

// 45–60 days back: its own newest row was edited weeks ago.
const OLD_WINDOW = {
    fromInstant: Date.parse("2026-08-20T21:00:00.000Z"),
    toInstant: Date.parse("2026-09-04T20:59:59.999Z"),
    fromDay: "2026-08-21",
    toDay: "2026-09-04",
} satisfies NonNullable<OrderWindow>;
const FETCH_MARK = "2026-10-19T08:00:00.000Z";

function row(id: string, updatedAt: string, version = 1): Order {
    return {
        id,
        tenant_id: TENANT,
        order_id: id,
        customer_name: "x",
        phone: "07700000000",
        items: [],
        price: 1,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-08-25T08:00:00.000Z",
        updated_at: updatedAt,
        version,
        is_return: false,
        is_replacement: false,
        is_archived: false,
    } as Order;
}

const ms = (iso: string) => Date.parse(iso);
const sinceOf = (call: unknown[]) => call[1] as string;

function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const batcher = new RealtimeBatcher({ queryClient: qc, queryKey: orderKeys.lists(), getWindow: () => OLD_WINDOW });
    setOrderBatcher(batcher);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return { qc, wrapper };
}

async function coldLoad() {
    const ctx = setup();
    const { result } = renderHook(() => useOrdersQuery(OLD_WINDOW, true), { wrapper: ctx.wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    return ctx;
}

beforeEach(() => {
    H.tenantId = TENANT;
    H.findWindow.mockReset();
    H.findLatestUpdatedAt.mockReset();
    H.findChangedSince.mockReset();
    H.findWindow.mockResolvedValue([row("a", "2026-09-12T10:00:00.000Z"), row("b", "2026-09-01T10:00:00.000Z")]);
    H.findLatestUpdatedAt.mockResolvedValue(FETCH_MARK);
    H.findChangedSince.mockResolvedValue([]);
    sessionStorage.clear();
});

describe("catch-up delta watermark", () => {
    it("a historical window's first delta starts at the fetch-start mark minus the overlap, not at the window's old rows", async () => {
        const { qc } = await coldLoad();
        expect(H.findLatestUpdatedAt).toHaveBeenCalledWith(TENANT);
        // The mark is read before the rows.
        expect(H.findLatestUpdatedAt.mock.invocationCallOrder[0]).toBeLessThan(H.findWindow.mock.invocationCallOrder[0]);

        await requestOrdersCatchUp(qc, TENANT, { source: "statusSettled" });
        expect(H.findChangedSince).toHaveBeenCalledTimes(1);
        const [tenant, since] = H.findChangedSince.mock.calls[0];
        expect(tenant).toBe(TENANT);
        expect(ms(since)).toBe(ms(FETCH_MARK) - DELTA_OVERLAP_MS);
        expect(ms(since)).toBeGreaterThan(ms("2026-09-12T10:00:00.000Z"));
    });

    it("applies the overlap once; the next delta starts at its newest row minus a small skew", async () => {
        const { qc } = await coldLoad();
        H.findChangedSince.mockResolvedValueOnce([row("a", "2026-10-19T08:03:00.000Z", 2)]);
        await requestOrdersCatchUp(qc, TENANT, { source: "first" });
        expect(getSyncWatermark(qc)).toEqual({ at: "2026-10-19T08:03:00.000Z", fromFetch: false });
        expect(qc.getQueryData<Order[]>(orderKeys.lists())?.find((o) => o.id === "a")?.version).toBe(2);

        await requestOrdersCatchUp(qc, TENANT, { source: "second" });
        expect(ms(sinceOf(H.findChangedSince.mock.calls[1]))).toBe(ms("2026-10-19T08:03:00.000Z") - DELTA_SKEW_MS);
    });

    it("an empty delta still spends the overlap", async () => {
        const { qc } = await coldLoad();
        await requestOrdersCatchUp(qc, TENANT, { source: "first" });
        await requestOrdersCatchUp(qc, TENANT, { source: "second" });
        expect(ms(sinceOf(H.findChangedSince.mock.calls[1]))).toBe(ms(FETCH_MARK) - DELTA_SKEW_MS);
    });

    it("a caller's own write lowers the start, never raises it", async () => {
        const { qc } = await coldLoad();
        await requestOrdersCatchUp(qc, TENANT, { source: "s", since: "2026-10-19T07:00:00.000Z" });
        expect(sinceOf(H.findChangedSince.mock.calls[0])).toBe("2026-10-19T07:00:00.000Z");
        await requestOrdersCatchUp(qc, TENANT, { source: "s", since: "2026-10-19T09:00:00.000Z" });
        expect(ms(sinceOf(H.findChangedSince.mock.calls[1]))).toBe(ms(FETCH_MARK) - DELTA_SKEW_MS);
    });
});

describe("catch-up delta overflow", () => {
    it(`a delta of ${DELTA_ROW_CAP} rows keeps the watermark and refetches the list exactly once`, async () => {
        const { qc } = await coldLoad();
        const capped = Array.from({ length: DELTA_ROW_CAP }, (_, i) => row(`d${i}`, "2026-10-19T09:00:00.000Z", 5));
        H.findChangedSince.mockResolvedValueOnce(capped);
        const before = getSyncWatermark(qc);
        const fetchesBefore = H.findWindow.mock.calls.length;
        const refetch = vi.spyOn(qc, "refetchQueries");

        await syncOrdersDelta(qc, TENANT, "heartbeatDrift");
        expect(getSyncWatermark(qc)).toEqual(before);
        expect(refetch).toHaveBeenCalledTimes(1);
        expect(refetch).toHaveBeenCalledWith({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
        await waitFor(() => expect(H.findWindow.mock.calls.length).toBe(fetchesBefore + 1));
        // The partial batch was not applied as if it were complete.
        expect(qc.getQueryData<Order[]>(orderKeys.lists())?.some((o) => o.id.startsWith("d"))).toBe(false);
    });

    it("one row under the cap is a complete delta", async () => {
        const { qc } = await coldLoad();
        H.findChangedSince.mockResolvedValueOnce(Array.from({ length: DELTA_ROW_CAP - 1 }, (_, i) => row(`d${i}`, "2026-10-19T09:00:00.000Z")));
        const refetch = vi.spyOn(qc, "refetchQueries");
        await syncOrdersDelta(qc, TENANT, "heartbeatDrift");
        expect(refetch).not.toHaveBeenCalled();
        expect(getSyncWatermark(qc)?.at).toBe("2026-10-19T09:00:00.000Z");
    });
});

describe("catch-up delta fallbacks", () => {
    it("no watermark: refetches the list instead of trusting the cache's own newest row", async () => {
        H.findLatestUpdatedAt.mockRejectedValue(new Error("network"));
        const { qc } = await coldLoad();
        const refetch = vi.spyOn(qc, "refetchQueries");
        await syncOrdersDelta(qc, TENANT, "appReopen");
        expect(H.findChangedSince).not.toHaveBeenCalled();
        expect(refetch).toHaveBeenCalledWith({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
    });

    it("a null tenant makes the catch-up a no-op: no delta and no full invalidate", async () => {
        const { qc } = await coldLoad();
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        const refetch = vi.spyOn(qc, "refetchQueries");
        await requestOrdersCatchUp(qc, null, { source: "statusSettled" });
        expect(H.findChangedSince).not.toHaveBeenCalled();
        expect(invalidate).not.toHaveBeenCalled();
        expect(refetch).not.toHaveBeenCalled();
    });

    it("a failed delta falls back to a full invalidate and does not reject", async () => {
        const { qc } = await coldLoad();
        H.findChangedSince.mockRejectedValueOnce(new Error("boom"));
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        await expect(requestOrdersCatchUp(qc, TENANT, { source: "s" })).resolves.toBeUndefined();
        expect(invalidate).toHaveBeenCalledWith({ queryKey: orderKeys.lists() });
    });
});

describe("catch-up coalescing", () => {
    it("requests during a running delta share one follow-up that starts after them", async () => {
        const { qc } = await coldLoad();
        let release: () => void = () => {};
        H.findChangedSince.mockImplementationOnce(() => new Promise<Order[]>((r) => { release = () => r([]); }));

        const first = requestOrdersCatchUp(qc, TENANT, { source: "mutationCancel" });
        await waitFor(() => expect(H.findChangedSince).toHaveBeenCalledTimes(1));
        let secondDone = false;
        const second = requestOrdersCatchUp(qc, TENANT, { source: "statusSettled", since: "2026-10-19T07:30:00.000Z" }).then(() => { secondDone = true; });
        const third = requestOrdersCatchUp(qc, TENANT, { source: "statusSettled", since: "2026-10-19T07:00:00.000Z" });

        release();
        await first;
        // The in-flight delta started before the second request: it cannot
        // resolve it.
        await second;
        await third;
        expect(secondDone).toBe(true);
        expect(H.findChangedSince).toHaveBeenCalledTimes(2);
        // The follow-up starts no later than the lowest floor asked for.
        expect(sinceOf(H.findChangedSince.mock.calls[1])).toBe("2026-10-19T07:00:00.000Z");
        // The second promise resolved only once the follow-up had run.
        expect(H.findChangedSince.mock.invocationCallOrder[1]).toBeGreaterThan(H.findChangedSince.mock.invocationCallOrder[0]);
    });
});
