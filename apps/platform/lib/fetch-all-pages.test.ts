import { describe, expect, it } from "vitest";
import { fetchAllPages, TruncatedResultError } from "./fetch-all-pages";

const table = Array.from({ length: 250 }, (_, i) => i);
const pager = (cap: number) => async (offset: number) => ({
    rows: table.slice(offset, offset + cap),
    total: table.length,
});

describe("fetchAllPages", () => {
    it("reads every row across pages", async () => {
        expect(await fetchAllPages(pager(100))).toEqual(table);
    });

    it("handles an empty result", async () => {
        expect(await fetchAllPages(async () => ({ rows: [], total: 0 }))).toEqual([]);
    });

    it("fails when the server stops short of the reported total", async () => {
        const stalls = async (offset: number) => ({ rows: offset === 0 ? table.slice(0, 100) : [], total: table.length });
        await expect(fetchAllPages(stalls)).rejects.toBeInstanceOf(TruncatedResultError);
    });
});
