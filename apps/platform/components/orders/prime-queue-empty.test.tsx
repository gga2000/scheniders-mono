// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useOrderStore } from "@/store/use-order-store";
import type { PrimeQueues } from "@/hooks/use-prime-queues";
import { PrimeQueueEmpty } from "./prime-queue-empty";

const state: { value: PrimeQueues } = { value: { connected: true, data: null, queues: null } };
vi.mock("@/hooks/use-prime-queues", () => ({ usePrimeQueues: () => state.value }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));

const queue = (orderIds: string[]) => ({ problems: [], orderIds, waiting: orderIds.length, byOrder: new Map() });

afterEach(() => {
    cleanup();
    useOrderStore.getState().setPrimeQueue(null);
});

describe("PrimeQueueEmpty", () => {
    it("says all done when the queue is empty, and leads back to the list", () => {
        state.value = { connected: true, data: null, queues: { fix: queue([]), back: queue(["a"]) } };
        useOrderStore.getState().setPrimeQueue("fix");
        render(<PrimeQueueEmpty queue="fix" />);
        expect(screen.getByText("orders.primeQueue.fix.empty")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "orders.primeQueue.backToList" }));
        expect(useOrderStore.getState().primeQueue).toBeNull();
    });

    it("shows placeholders while the queue's orders are still arriving", () => {
        state.value = { connected: true, data: null, queues: { fix: queue([]), back: queue(["a"]) } };
        const { container } = render(<PrimeQueueEmpty queue="back" />);
        expect(container.querySelector("[aria-busy=true]")).toBeTruthy();
        expect(screen.queryByText("orders.primeQueue.back.empty")).toBeNull();
    });
});
