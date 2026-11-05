// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useOrderStore } from "@/store/use-order-store";
import type { PrimeQueues } from "@/hooks/use-prime-queues";
import { PrimeQueueChips } from "./prime-queue-chips";

const state: { value: PrimeQueues } = {
    value: {
        connected: true,
        data: null,
        queues: {
            fix: { problems: [], orderIds: ["a", "b", "c"], waiting: 2 },
            back: { problems: [], orderIds: ["d"], waiting: 1 },
        },
    },
};
vi.mock("@/hooks/use-prime-queues", () => ({ usePrimeQueues: () => state.value }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));

afterEach(() => {
    cleanup();
    useOrderStore.getState().setPrimeQueue(null);
    state.value = { ...state.value, connected: true };
});

describe("PrimeQueueChips", () => {
    it("counts what nobody has handled and opens a queue", () => {
        render(<PrimeQueueChips />);
        const fix = screen.getByRole("button", { name: /orders.primeQueue.fix.label/ });
        expect(fix.getAttribute("data-chip-count")).toBe("2");
        expect(screen.getByRole("button", { name: /orders.primeQueue.back.label/ }).getAttribute("data-chip-count")).toBe("1");
        fireEvent.click(fix);
        expect(useOrderStore.getState().primeQueue).toBe("fix");
        fireEvent.click(fix);
        expect(useOrderStore.getState().primeQueue).toBeNull();
    });

    it("hides the numbers when counts are hidden", () => {
        render(<PrimeQueueChips countsHidden />);
        expect(screen.getByRole("button", { name: /orders.primeQueue.fix.label/ }).getAttribute("data-chip-count")).toBeNull();
    });

    it("is not there without a Prime link", () => {
        state.value = { ...state.value, connected: false };
        render(<PrimeQueueChips />);
        expect(screen.queryByRole("button")).toBeNull();
    });
});
