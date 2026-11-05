// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useOrderStore } from "@/store/use-order-store";
import type { PrimeQueueEntry } from "@/hooks/use-prime-queues";
import { PrimeQueueStatus } from "./prime-queue-status";

const entry: { value: PrimeQueueEntry | null } = { value: null };
vi.mock("@/hooks/use-prime-queues", () => ({ usePrimeQueueEntry: () => entry.value }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string, v?: Record<string, string>) => (v?.reason ? `${key}:${v.reason}` : key) }) }));
vi.mock("@/lib/prime/when", () => ({
    primeWhen: () => "today",
    primeReasonText: (note: { reason: string | null } | null) => (note?.reason ? `Prime: ${note.reason}` : null),
}));

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

    it("shows the problem, Prime's step and its reason as chips", () => {
        useOrderStore.getState().setPrimeQueue("fix");
        entry.value = { queue: "fix", problem: { orderId: "o", kind: "failed", since: view.sentAt, handled: false }, view, order: {} as PrimeQueueEntry["order"] };
        const { container } = render(<PrimeQueueStatus orderId="o" />);
        expect(container.querySelector("[data-prime-queue-status]")?.getAttribute("data-prime-queue-status")).toBe("failed");
        expect(container.querySelector("[data-prime-step]")?.textContent).toBe("With the driver");
        expect(container.querySelector("[data-prime-reason]")?.textContent).toContain("No answer");
    });
});
