import { describe, expect, it } from "vitest";
import type { PrimeProblem } from "./problems";
import { primeQueues } from "./queues";

const p = (orderId: string, kind: PrimeProblem["kind"], handled = false): PrimeProblem => ({ orderId, kind, since: "2026-11-04T10:00:00Z", handled });

describe("primeQueues", () => {
    it("puts parcels coming back in «راجع» and every other problem in «معالجة», keeping the order", () => {
        const q = primeQueues([p("a", "failed"), p("b", "returning"), p("c", "stuck", true), p("d", "postponed")]);
        expect(q.fix.orderIds).toEqual(["a", "c", "d"]);
        expect(q.back.orderIds).toEqual(["b"]);
    });

    it("counts only the problems nobody handled", () => {
        const q = primeQueues([p("a", "failed"), p("c", "stuck", true), p("b", "returning", true)]);
        expect(q.fix.waiting).toBe(1);
        expect(q.back.waiting).toBe(0);
    });
});
