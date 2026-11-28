import { describe, it, expect } from "vitest";
import { readScrollEdges } from "./use-scroll-edge-fade";

describe("readScrollEdges", () => {
    it("reads no hidden end when everything fits", () => {
        expect(readScrollEdges({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })).toEqual({ top: false, bottom: false });
    });

    it("reads the bottom as hidden at the top of a list that scrolls", () => {
        expect(readScrollEdges({ scrollTop: 0, clientHeight: 400, scrollHeight: 480 })).toEqual({ top: false, bottom: true });
    });

    it("reads both ends as hidden in the middle", () => {
        expect(readScrollEdges({ scrollTop: 40, clientHeight: 400, scrollHeight: 480 })).toEqual({ top: true, bottom: true });
    });

    it("reads the top as hidden at the end", () => {
        expect(readScrollEdges({ scrollTop: 80, clientHeight: 400, scrollHeight: 480 })).toEqual({ top: true, bottom: false });
    });

    it("ignores a sub-pixel remainder", () => {
        expect(readScrollEdges({ scrollTop: 1, clientHeight: 400, scrollHeight: 402 })).toEqual({ top: false, bottom: false });
    });
});
