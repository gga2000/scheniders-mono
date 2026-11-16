import { describe, expect, it } from "vitest";
import { QueryClient, type QueryCacheNotifyEvent } from "@tanstack/react-query";
import { isOrdersListChange } from "./use-dashboard-metrics-query";

/**
 * How many cache events count as an orders change while `run` touches the
 * cache. Judged as each event arrives, as the hook does: the event carries the
 * live query, whose state moves on afterwards.
 */
function changesDuring(run: (client: QueryClient) => void): number {
    const client = new QueryClient();
    let changes = 0;
    const stop = client.getQueryCache().subscribe((e: QueryCacheNotifyEvent) => {
        if (isOrdersListChange(e)) changes++;
    });
    run(client);
    stop();
    return changes;
}

describe("isOrdersListChange", () => {
    const list = ["orders", "list", "t1"];

    it("ignores an orders list's first load", () => {
        expect(changesDuring((c) => c.setQueryData(list, [{ id: "a" }]))).toBe(0);
    });

    it("fires when a loaded orders list takes on new data", () => {
        const changes = changesDuring((c) => {
            c.setQueryData(list, [{ id: "a" }]);
            c.setQueryData(list, [{ id: "a" }, { id: "b" }]);
        });
        expect(changes).toBe(1);
    });

    it("ignores other queries, including the metrics themselves", () => {
        const changes = changesDuring((c) => {
            for (const key of [["dashboard-metrics", "all", "t1"], ["orders", "detail", "x"]]) {
                c.setQueryData(key, 1);
                c.setQueryData(key, 2);
            }
        });
        expect(changes).toBe(0);
    });
});
