import { describe, expect, it } from "vitest";
import type { PrimeDeskRow } from "./desk-preview";
import { primeDeskCounts, primeDeskState, primeRunMoney, type PrimeRunProgress } from "./desk-state";

const rows = new Map<string, PrimeDeskRow>([
    ["a", { orderId: "a", kind: "ready", fee: 3000, caseId: null }],
    ["b", { orderId: "b", kind: "ready", fee: null, caseId: null }],
    ["c", { orderId: "c", kind: "fix", reason: "bad_phone", caseId: null }],
    ["d", { orderId: "d", kind: "after_sale", caseId: null }],
    ["e", { orderId: "e", kind: "ready", fee: 6000, caseId: 52176701 }],
]);

const progress = (over: Partial<PrimeRunProgress> = {}): PrimeRunProgress => ({ sent: new Map(), failed: new Set(), sending: new Set(), ...over });

describe("primeDeskState", () => {
    it("before a run: waiting, what to fix, the Excel file, or the case Prime already has", () => {
        expect(primeDeskState("a", rows.get("a"), null)).toEqual({ kind: "waiting" });
        expect(primeDeskState("c", rows.get("c"), null)).toEqual({ kind: "fix", reason: "bad_phone" });
        expect(primeDeskState("d", rows.get("d"), null)).toEqual({ kind: "excel" });
        expect(primeDeskState("e", rows.get("e"), null)).toEqual({ kind: "sent", caseId: 52176701 });
    });

    it("during a run: the run's answer wins over the check made before it", () => {
        const run = progress({ sent: new Map([["a", 123456]]), sending: new Set(["b"]), failed: new Set(["c"]) });
        expect(primeDeskState("a", rows.get("a"), run)).toEqual({ kind: "sent", caseId: 123456 });
        expect(primeDeskState("b", rows.get("b"), run)).toEqual({ kind: "sending" });
        expect(primeDeskState("c", rows.get("c"), run)).toEqual({ kind: "excel" });
    });

    it("nothing until the check answers", () => {
        expect(primeDeskState("z", undefined, null)).toBeNull();
    });
});

describe("primeDeskCounts", () => {
    it("counts what reached Prime, what waits (sending included) and what needs fixing", () => {
        expect(primeDeskCounts(["a", "b", "c", "d", "e"], rows, null)).toEqual({ sent: 1, waiting: 2, fix: 1 });
        expect(primeDeskCounts(["a", "b", "c", "d", "e"], rows, progress({ sent: new Map([["a", 1]]), sending: new Set(["b"]) }))).toEqual({
            sent: 2,
            waiting: 1,
            fix: 1,
        });
    });
});

describe("primeRunMoney", () => {
    it("cash at the door minus Prime's fees; refunds pay out and count no cash; unpriced parcels are counted apart", () => {
        const money = primeRunMoney(
            [
                { id: "a", cash: { direction: "collect", amount: 36_750 } },
                { id: "b", cash: { direction: "collect", amount: 73_500 } },
                { id: "c", cash: { direction: "collect", amount: 34_750 } },
                { id: "d", cash: { direction: "pay", amount: 30_000 } },
                { id: "e", cash: { direction: "prepaid", amount: 0 } },
            ],
            rows,
        );
        expect(money).toEqual({ collect: 145_000, fees: 9000, unpriced: 1, net: 136_000 });
    });
});
