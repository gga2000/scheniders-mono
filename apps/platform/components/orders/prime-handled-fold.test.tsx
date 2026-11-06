// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Order } from "@/types/order";
import { PrimeHandledFold } from "./prime-handled-fold";

vi.mock("@/hooks/use-prime-queues", () => ({
    usePrimeQueueEntry: () => ({
        view: { problemCheckedBy: "Ali", problemCheckedAt: "2026-11-06T11:05:00Z", problemNote: "ما رد", stepName: "تعذر التوصيل" },
    }),
}));
vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string, vars?: Record<string, string>) => (vars ? `${key} ${Object.values(vars).join(" ")}` : key) }),
    useTextDir: () => "ltr",
}));

const order = (id: string, name: string): Order => ({ id, order_id: `42611${id}`, customer_name: name }) as Order;

afterEach(cleanup);

describe("PrimeHandledFold", () => {
    it("shows nothing when no order is handled", () => {
        const { container } = render(<PrimeHandledFold orders={[]} renderCard={() => null} />);
        expect(container.innerHTML).toBe("");
    });

    it("stays closed with a count, opens to one line per order, and shows a card on «عرض»", () => {
        render(<PrimeHandledFold orders={[order("1", "اصيل"), order("2", "احمد")]} renderCard={(o) => <div data-testid={`card-${o.id}`} />} />);
        const toggle = screen.getByRole("button", { name: /orders.primeQueue.handledFold/ });
        expect(toggle.textContent).toContain("2");
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByText(/اصيل/)).toBeNull();

        fireEvent.click(toggle);
        expect(screen.getByText(/اصيل · #426111/)).toBeTruthy();
        expect(screen.getByText(/احمد · #426112/)).toBeTruthy();
        expect(screen.getAllByText(/prime.problems.handledBy Ali/)).toHaveLength(2);
        expect(screen.queryByTestId("card-1")).toBeNull();

        fireEvent.click(screen.getAllByRole("button", { name: /orders.primeQueue.view/ })[0]);
        expect(screen.getByTestId("card-1")).toBeTruthy();
        expect(screen.queryByTestId("card-2")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: /orders.primeQueue.hide/ }));
        expect(screen.queryByTestId("card-1")).toBeNull();
    });
});
