// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useOrderStore } from "@/store/use-order-store";
import type { PrimeQueueEntry } from "@/hooks/use-prime-queues";
import { PrimeQueueStatus } from "./prime-queue-status";

const entry: { value: PrimeQueueEntry | null } = { value: null };
vi.mock("@/hooks/use-prime-queues", () => ({ usePrimeQueueEntry: () => entry.value }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }), useTextDir: () => "rtl" }));
vi.mock("@/lib/prime/when", () => ({ primeWhen: () => "today" }));

const view = {
    caseId: 1, status: "ONWAY", stepCode: "RTN_WITHAGENT", stepName: "With the driver", sentAt: "2026-11-05T00:00:00Z", statusChangedAt: "2026-11-05T00:00:00Z",
    pushError: null, cancelRefusedAt: null, cancelledAt: null, returnReason: "No answer", postponeReason: null, postponedTo: null,
} as unknown as PrimeQueueEntry["view"];

afterEach(() => {
    cleanup();
    useOrderStore.getState().setPrimeQueue(null);
    entry.value = null;
});

describe("PrimeQueueStatus", () => {
    it("shows nothing while no queue is on", () => {
        entry.value = { queue: "fix", problem: { orderId: "o", kind: "failed", since: view.sentAt, handled: false }, view, order: {} as PrimeQueueEntry["order"] };
        const { container } = render(<PrimeQueueStatus orderId="o" />);
        expect(container.innerHTML).toBe("");
    });

    it("labels the order status, Prime's step, Prime's answer and the last comment", () => {
        useOrderStore.getState().setPrimeQueue("fix");
        entry.value = { queue: "fix", problem: { orderId: "o", kind: "failed", since: view.sentAt, handled: false }, view, order: {} as PrimeQueueEntry["order"] };
        const { container } = render(<PrimeQueueStatus orderId="o" />);
        expect(container.querySelector("[data-prime-queue-status]")?.getAttribute("data-prime-queue-status")).toBe("failed");
        const field = (f: string) => container.querySelector(`[data-prime-field="${f}"]`)?.textContent ?? "";
        expect(field("status")).toContain("prime.problems.kind.failed");
        expect(field("step")).toContain("With the driver");
        expect(field("answer")).toContain("No answer");
        expect(field("comment")).toContain("orders.primeQueue.field.none");
    });
});
