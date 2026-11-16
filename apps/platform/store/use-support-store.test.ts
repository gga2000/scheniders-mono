import { describe, expect, it } from "vitest";
import { hasNewNotice } from "./use-support-store";

describe("hasNewNotice", () => {
    it("marks a live notice the chat has not shown yet", () => {
        expect(hasNewNotice("n2", "n1")).toBe(true);
        expect(hasNewNotice("n1", null)).toBe(true);
    });

    it("stays quiet with no notice, or once it was shown", () => {
        expect(hasNewNotice(null, "n1")).toBe(false);
        expect(hasNewNotice(undefined, null)).toBe(false);
        expect(hasNewNotice("n1", "n1")).toBe(false);
    });
});
