import { describe, expect, it } from "vitest";
import { getDateKey } from "./dashboard-calculations";

describe("getDateKey", () => {
    it("files 00:00-02:59 Baghdad time under that Baghdad day, not the UTC day before", () => {
        expect(getDateKey(new Date("2026-11-10T22:30:00Z"))).toBe("2026-11-11");
        expect(getDateKey(new Date("2026-11-10T20:59:00Z"))).toBe("2026-11-10");
    });
});
