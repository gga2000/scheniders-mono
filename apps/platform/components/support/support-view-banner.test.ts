import { describe, it, expect } from "vitest";
import { formatTimeLeft } from "./support-view-banner";

describe("formatTimeLeft", () => {
    it.each([
        [30 * 60 * 1000, "30:00"],
        [28 * 60 * 1000 + 14_000, "28:14"],
        [59_999, "0:59"],
        [-5_000, "0:00"],
    ])("%i ms reads %s", (ms, text) => {
        expect(formatTimeLeft(ms)).toBe(text);
    });
});
