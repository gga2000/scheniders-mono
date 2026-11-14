import { describe, it, expect } from "vitest";
import { requestNeverSent } from "./request-never-sent";

const failed = (code?: string) => new TypeError("fetch failed", { cause: code ? Object.assign(new Error(code), { code }) : undefined });

describe("requestNeverSent", () => {
    it("is true only when the request certainly never left", () => {
        expect(requestNeverSent(failed("ENOTFOUND"))).toBe(true);
        expect(requestNeverSent(failed("ECONNREFUSED"))).toBe(true);
        expect(requestNeverSent(failed("EAI_AGAIN"))).toBe(true);
    });

    it("is false for a timeout, a reset or an unknown failure (the server may have acted)", () => {
        expect(requestNeverSent(new DOMException("timed out", "TimeoutError"))).toBe(false);
        expect(requestNeverSent(failed("ECONNRESET"))).toBe(false);
        expect(requestNeverSent(failed())).toBe(false);
        expect(requestNeverSent("boom")).toBe(false);
    });
});
