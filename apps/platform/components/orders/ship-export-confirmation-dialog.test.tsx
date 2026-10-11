/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { Order } from "@/types/order";
import { ShipExportConfirmationDialog } from "./ship-export-confirmation-dialog";

afterEach(cleanup);

// 12:00 Baghdad on 7 Sep 2026.
const NOW = new Date("2026-09-07T09:00:00.000Z");

const order = (id: string, scheduled_date: string | null) =>
    ({ id, order_id: id, customer_name: `C${id}`, status: "confirmed", scheduled_date }) as unknown as Order;

const orders = [order("101", null), order("102", "2026-09-07"), order("103", "2026-09-09")];

const renderDialog = () => {
    const onConfirmExport = vi.fn();
    render(
        <ShipExportConfirmationDialog
            open
            onOpenChange={() => {}}
            company="prime"
            orders={orders}
            currentTab="confirmed"
            hasSelection
            onConfirmExport={onConfirmExport}
        />,
    );
    return { onConfirmExport };
};

describe("ship export — orders scheduled for a later day", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    // One tick per act, so the countdown effect re-arms between seconds.
    const waitOutCountdown = () => {
        for (let i = 0; i < 6; i++) act(() => { vi.advanceTimersByTime(1000); });
    };

    it("warns about them and leaves them out by default", () => {
        const { onConfirmExport } = renderDialog();
        expect(screen.getByText(/1 order is scheduled for a later day/)).toBeTruthy();
        waitOutCountdown();

        // The order due today ships; only the one for the 9th is held back.
        const button = screen.getByRole("button", { name: /Export 2 Orders/ });
        fireEvent.click(button);
        expect(onConfirmExport).toHaveBeenCalledWith({ includeScheduledLater: false });
    });

    it("ships them only when the merchant explicitly opts in", () => {
        const { onConfirmExport } = renderDialog();
        fireEvent.click(screen.getByRole("checkbox", { name: /Ship them today anyway/ }));
        waitOutCountdown();

        fireEvent.click(screen.getByRole("button", { name: /Export 3 Orders/ }));
        expect(onConfirmExport).toHaveBeenCalledWith({ includeScheduledLater: true });
    });
});
