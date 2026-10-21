import { describe, it, expect } from "vitest";
import { cartState, summarizeRecovery } from "./recovery-stats";

describe("cartState", () => {
    it("prioritizes recovered > reminded > pending", () => {
        expect(cartState({ reminded_at: "t", recovered_at: "t" })).toBe("recovered");
        expect(cartState({ reminded_at: "t", recovered_at: null })).toBe("reminded");
        expect(cartState({ reminded_at: null, recovered_at: null })).toBe("pending");
    });
});

describe("summarizeRecovery", () => {
    it("tallies states + recovered value + rate, splitting recovered by how it came back", () => {
        const s = summarizeRecovery([
            { reminded_at: null, recovered_at: null, subtotal_iqd: 1000, recovery_kind: null },
            { reminded_at: "t", recovered_at: null, subtotal_iqd: 2000, recovery_kind: null },
            { reminded_at: "t", recovered_at: "t", subtotal_iqd: 3000, recovery_kind: "after_reminder" },
            { reminded_at: null, recovered_at: "t", subtotal_iqd: 5000, recovery_kind: "organic" },
        ]);
        expect(s.total).toBe(4);
        expect(s.pending).toBe(1);
        expect(s.reminded).toBe(1);
        expect(s.recovered).toBe(2);
        expect(s.recoveredAfterReminder).toBe(1);
        expect(s.recoveredOrganic).toBe(1);
        expect(s.recoveredValue).toBe(8000);
        expect(s.recoveryRate).toBe(0.5);
    });

    it("never credits a reminder without the database saying one came first", () => {
        const s = summarizeRecovery([
            { reminded_at: null, recovered_at: "t", subtotal_iqd: 1000, recovery_kind: null },
        ]);
        expect(s.recoveredAfterReminder).toBe(0);
        expect(s.recoveredOrganic).toBe(1);
    });

    it("is empty-safe", () => {
        expect(summarizeRecovery([])).toMatchObject({
            total: 0,
            recoveryRate: 0,
            recoveredAfterReminder: 0,
            recoveredOrganic: 0,
        });
    });
});
