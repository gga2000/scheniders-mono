import { describe, expect, it } from "vitest";
import { formatDelta } from "./delta";

describe("formatDelta", () => {
    it("shows one decimal under 10% and whole percents above", () => {
        expect(formatDelta(3.14)).toBe("3.1%");
        expect(formatDelta(-3.14)).toBe("3.1%");
        expect(formatDelta(67.4)).toBe("67%");
        expect(formatDelta(999)).toBe("999%");
    });

    it("switches to a multiple past +1000%", () => {
        expect(formatDelta(10100)).toBe("102×");
        expect(formatDelta(1000)).toBe("11×");
    });
});
