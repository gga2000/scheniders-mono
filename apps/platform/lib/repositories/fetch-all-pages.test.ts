import { describe, it, expect, vi } from "vitest";
import { fetchAllPages, PAGE_SIZE } from "./fetch-all-pages";

const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => start + i);

describe("fetchAllPages", () => {
    it("reads one short page and stops", async () => {
        const read = vi.fn(async () => ({ data: rows(10), error: null }));
        expect(await fetchAllPages(read)).toHaveLength(10);
        expect(read).toHaveBeenCalledTimes(1);
        expect(read).toHaveBeenCalledWith(0, PAGE_SIZE - 1);
    });

    it("keeps reading while pages are full, so rows past the API cap are not lost", async () => {
        const read = vi
            .fn<(from: number, to: number) => Promise<{ data: number[]; error: null }>>()
            .mockResolvedValueOnce({ data: rows(PAGE_SIZE), error: null })
            .mockResolvedValueOnce({ data: rows(PAGE_SIZE, PAGE_SIZE), error: null })
            .mockResolvedValueOnce({ data: rows(5, 2 * PAGE_SIZE), error: null });
        const all = await fetchAllPages(read);
        expect(all).toHaveLength(2 * PAGE_SIZE + 5);
        expect(read.mock.calls.map((c) => c[0])).toEqual([0, PAGE_SIZE, 2 * PAGE_SIZE]);
    });

    it("throws a page error instead of returning a partial list", async () => {
        const read = vi
            .fn<(from: number, to: number) => Promise<{ data: number[] | null; error: { message: string } | null }>>()
            .mockResolvedValueOnce({ data: rows(PAGE_SIZE), error: null })
            .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
        await expect(fetchAllPages(read)).rejects.toEqual({ message: "boom" });
    });
});
