/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const reportOrderError = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/order-telemetry", () => ({
    reportOrderError: (...args: unknown[]) => reportOrderError(...args),
}));

vi.mock("@/hooks/use-toast", () => ({
    toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import { OrderModalBoundary, withOrderModalBoundary } from "./order-modal-boundary";

function Exploding(): React.ReactElement {
    throw new Error("modal blew up");
}

function Working({ open }: { open?: boolean; onClose?: () => void }) {
    return <div>modal is open: {String(open)}</div>;
}

// React logs caught render errors to console.error; silence it so a passing
// run does not look like a failing one.
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    reportOrderError.mockClear();
    toastError.mockClear();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    consoleError.mockRestore();
    cleanup();
});

describe("OrderModalBoundary", () => {
    it("renders children when nothing throws", () => {
        render(
            <OrderModalBoundary name="Test">
                <div>healthy modal</div>
            </OrderModalBoundary>,
        );
        expect(screen.getByText("healthy modal")).toBeTruthy();
        expect(reportOrderError).not.toHaveBeenCalled();
    });

    it("contains a throw instead of letting it reach the page, and dismisses the modal", () => {
        const onClose = vi.fn();
        render(
            <OrderModalBoundary name="Test" onClose={onClose}>
                <Exploding />
            </OrderModalBoundary>,
        );

        // The page survives: the boundary renders nothing rather than rethrowing.
        expect(screen.queryByText("modal blew up")).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(toastError).toHaveBeenCalledTimes(1);
    });

    it("reports the failure with the modal name so it is traceable", () => {
        render(
            <OrderModalBoundary name="SplitOrderDialog">
                <Exploding />
            </OrderModalBoundary>,
        );

        expect(reportOrderError).toHaveBeenCalledTimes(1);
        const [error, context] = reportOrderError.mock.calls[0] as [Error, { operation: string }];
        expect(error.message).toBe("modal blew up");
        expect(context.operation).toBe("orders-modal:SplitOrderDialog");
    });

    it("survives a modal with no onClose handler", () => {
        expect(() =>
            render(
                <OrderModalBoundary name="Test">
                    <Exploding />
                </OrderModalBoundary>,
            ),
        ).not.toThrow();
    });
});

describe("withOrderModalBoundary", () => {
    it("passes props through to the wrapped modal", () => {
        const Bounded = withOrderModalBoundary("Working", Working);
        render(<Bounded open />);
        expect(screen.getByText("modal is open: true")).toBeTruthy();
    });

    it("re-arms when the modal is reopened, so one failure does not kill it forever", () => {
        // Fails the first time it is opened, succeeds the next time.
        let shouldThrow = true;
        function Flaky({ open }: { open?: boolean; onClose?: () => void }) {
            if (shouldThrow) throw new Error("first open fails");
            return <div>recovered at open={String(open)}</div>;
        }

        const Bounded = withOrderModalBoundary("Flaky", Flaky);
        const { rerender } = render(<Bounded open />);
        expect(screen.queryByText(/recovered/)).toBeNull();
        expect(reportOrderError).toHaveBeenCalledTimes(1);

        // Close, then reopen. The key change gives the reopened modal a fresh
        // boundary rather than the tripped one.
        shouldThrow = false;
        rerender(<Bounded open={false} />);
        rerender(<Bounded open />);

        expect(screen.getByText("recovered at open=true")).toBeTruthy();
    });
});
