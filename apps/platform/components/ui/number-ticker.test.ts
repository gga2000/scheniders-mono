import { describe, expect, it } from "vitest";
import { rollStart } from "./number-ticker";

describe("rollStart", () => {
    it("starts below the value with the same number of digits, so every digit spins", () => {
        expect(rollStart(487_000)).toBe(170_450);
        expect(String(rollStart(663)).length).toBe(3);
        expect(rollStart(18)).toBe(10);
        expect(rollStart(351.42)).toBe(123);
    });

    it("counts small and empty figures up from zero", () => {
        expect(rollStart(0)).toBe(0);
        expect(rollStart(7)).toBe(0);
        expect(rollStart(0.026)).toBe(0);
    });
});
