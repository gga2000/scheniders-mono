import { describe, expect, it } from "vitest";
import { readHiddenMembers, writeHiddenMembers } from "./hidden-payroll-members";

function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe("hidden payroll members", () => {
    it("round-trips ids", () => {
        const s = memoryStorage();
        expect(writeHiddenMembers(s, new Set(["u1", "u2"]))).toBe(true);
        expect([...readHiddenMembers(s)]).toEqual(["u1", "u2"]);
    });

    it("treats a broken or wrong-shaped saved value as nothing hidden", () => {
        expect(readHiddenMembers(memoryStorage({ salary_hidden_employees: "{oops" })).size).toBe(0);
        expect(readHiddenMembers(memoryStorage({ salary_hidden_employees: "[1,2]" })).size).toBe(0);
    });

    it("reports a full or blocked storage instead of throwing", () => {
        const full = { setItem: () => { throw new DOMException("full", "QuotaExceededError"); } };
        expect(writeHiddenMembers(full, new Set(["u1"]))).toBe(false);
    });
});
