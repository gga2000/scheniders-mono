import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const reported = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/report-error", () => ({ reportError: (err: unknown) => reported.push(err) }));

import { hydrateBootQueries, takeBoot } from "./take";
import { BOOT_GLOBAL, type BootFetchResult, type BootPayload } from "./schema";

const session = { userId: "u-1", profile: null, tenantId: null, role: null, permissions: [], supportView: null };
const payload = (over: Partial<BootPayload> = {}): BootPayload => ({ v: 1, serverNow: 10_000, session, queries: null, ...over });
const leave = (result: BootFetchResult) => {
    window[BOOT_GLOBAL] = Promise.resolve(result);
};

afterEach(() => {
    delete window[BOOT_GLOBAL];
    reported.length = 0;
});

describe("taking the first-load answer", () => {
    it("is taken once: a later sign-in reads afresh", async () => {
        leave({ status: 200, body: payload(), at: 12_000 });
        expect(await takeBoot()).toEqual({ payload: payload(), at: 12_000 });
        expect(await takeBoot()).toBeNull();
    });

    it("is none when the page sent no request, or the answer is not a 200", async () => {
        expect(await takeBoot()).toBeNull();
        for (const status of [0, 401, 500]) {
            leave({ status, body: null, at: 1 });
            expect(await takeBoot()).toBeNull();
        }
        expect(reported).toEqual([]);
    });

    it("refuses and reports an answer of the wrong shape", async () => {
        leave({ status: 200, body: { v: 2 }, at: 1 });
        expect(await takeBoot()).toBeNull();
        expect(reported).toHaveLength(1);
    });
});

describe("putting its reads in the cache", () => {
    function dehydrated(dataUpdatedAt: number) {
        const source = new QueryClient();
        source.setQueryData(["dashboard-metrics", "all", "t-1"], { n: 1 }, { updatedAt: dataUpdatedAt });
        return { mutations: [], queries: source.getQueryCache().getAll().map((q) => ({ queryKey: q.queryKey, queryHash: q.queryHash, state: q.state })) };
    }

    it("files them under their keys, read times moved onto this browser's clock", () => {
        const client = new QueryClient();
        // The server read at 9,000 and answered at 10,000 on its clock; the answer arrived at 70,000 here.
        hydrateBootQueries(client, { payload: payload({ serverNow: 10_000, queries: dehydrated(9_000) }), at: 70_000 });
        expect(client.getQueryData(["dashboard-metrics", "all", "t-1"])).toEqual({ n: 1 });
        expect(client.getQueryState(["dashboard-metrics", "all", "t-1"])?.dataUpdatedAt).toBe(69_000);
    });

    it("keeps a newer read already in the cache", () => {
        const client = new QueryClient();
        client.setQueryData(["dashboard-metrics", "all", "t-1"], { n: 2 }, { updatedAt: 100_000 });
        hydrateBootQueries(client, { payload: payload({ queries: dehydrated(9_000) }), at: 10_000 });
        expect(client.getQueryData(["dashboard-metrics", "all", "t-1"])).toEqual({ n: 2 });
    });
});
