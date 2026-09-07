/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { OrderCustomerCard } from "./order-customer-card";

afterEach(cleanup);

// Local 10:00 on 7 Sep 2026, so 8 Sep sits in the same calendar month view.
const NOW = new Date(2026, 8, 7, 10, 0, 0);

const baseOrder = {
    id: "o1",
    order_id: "7309",
    customer_name: "علي واثق",
    phone: "07727838391",
    city: "بغداد",
    address_details: "حي العامل",
    created_at: new Date(2026, 8, 7, 2, 46, 0).toISOString(),
    original_created_at: null,
    scheduled_date: null,
    delivery_slot: null,
    payment_status: "cod",
    status: "confirmed",
    price: 44750,
    items: [],
};

const renderCard = (
    overrides: Record<string, unknown> = {},
    { isEditing = false, updateFormData = vi.fn(), formData = {} } = {},
) => {
    const order = { ...baseOrder, ...overrides };
    render(
        <LanguageProvider>
            <OrderCustomerCard
                isEditing={isEditing}
                order={order}
                formData={formData}
                updateFormData={updateFormData}
                isUpdatingStatus={false}
                handleStatusChange={() => {}}
            />
        </LanguageProvider>,
    );
    return { updateFormData };
};

describe("OrderCustomerCard scheduling", () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(NOW);
    });
    afterEach(() => vi.useRealTimers());

    it("says an order is not scheduled when it has no scheduled date", () => {
        renderCard();
        expect(screen.getByText("غير مجدول")).toBeTruthy();
    });

    it("shows the scheduled day when the order is parked for later", () => {
        renderCard({ scheduled_date: "2026-09-09" });
        expect(screen.queryByText("غير مجدول")).toBeNull();
        expect(screen.getByText(/9 Sept?/)).toBeTruthy();
    });

    it("writes the schedule, not the order date, when postponing to tomorrow", () => {
        const { updateFormData } = renderCard({}, { isEditing: true });
        fireEvent.click(screen.getByRole("button", { name: "غداً" }));
        expect(updateFormData).toHaveBeenCalledWith("scheduled_date", "2026-09-08");
        expect(updateFormData).not.toHaveBeenCalledWith("created_at", expect.anything());
    });

    it("clears the schedule", () => {
        const { updateFormData } = renderCard(
            { scheduled_date: "2026-09-09" },
            { isEditing: true },
        );
        fireEvent.click(screen.getByRole("button", { name: /إزالة/ }));
        expect(updateFormData).toHaveBeenCalledWith("scheduled_date", null);
    });

    // The bug this whole change exists to stop: dating an order into the future.
    it("will not offer a future day in the order-date picker", () => {
        renderCard({}, { isEditing: true });

        const trigger = screen.getAllByRole("button").find((b) => /سبتمبر/.test(b.textContent || ""));
        expect(trigger).toBeTruthy();
        fireEvent.click(trigger!);

        const dialog = screen.getByRole("dialog");
        const today = within(dialog).getByRole("button", { name: "7" });
        const tomorrow = within(dialog).getByRole("button", { name: "8" });

        expect((today as HTMLButtonElement).disabled).toBe(false);
        expect((tomorrow as HTMLButtonElement).disabled).toBe(true);
    });

    // The bound is read at interaction time, so a form left open does not clamp
    // against a stale clock.
    it("keeps the future cut-off current while the form stays open", () => {
        renderCard({}, { isEditing: true });

        const trigger = screen.getAllByRole("button").find((b) => /سبتمبر/.test(b.textContent || ""));
        fireEvent.click(trigger!);

        let dialog = screen.getByRole("dialog");
        expect((within(dialog).getByRole("button", { name: "8" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(dialog, { key: "Escape" });

        // The clock rolls past midnight while the card sits open.
        vi.setSystemTime(new Date(2026, 8, 8, 9, 0, 0));

        fireEvent.click(trigger!);
        dialog = screen.getByRole("dialog");
        expect((within(dialog).getByRole("button", { name: "8" }) as HTMLButtonElement).disabled).toBe(false);
        expect((within(dialog).getByRole("button", { name: "9" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
