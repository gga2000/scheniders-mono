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

describe("OrderCustomerCard WhatsApp contact designation", () => {
    const withSecondary = { secondary_phone: "07811262261" };

    it("badges the designated number in view mode", () => {
        renderCard({ ...withSecondary, whatsapp_contact_slot: "secondary" });
        expect(screen.getAllByText("واتساب").length).toBeGreaterThan(0);
    });

    it("offers the shortcut into editing only while nothing is designated", () => {
        const { rerender } = render(
            <LanguageProvider>
                <OrderCustomerCard
                    isEditing={false}
                    order={{ ...baseOrder, ...withSecondary }}
                    formData={{}}
                    updateFormData={vi.fn()}
                    isUpdatingStatus={false}
                    handleStatusChange={() => {}}
                    onRequestEdit={vi.fn()}
                />
            </LanguageProvider>,
        );
        expect(screen.getByText("تحديد رقم الواتساب")).toBeTruthy();

        rerender(
            <LanguageProvider>
                <OrderCustomerCard
                    isEditing={false}
                    order={{ ...baseOrder, ...withSecondary, whatsapp_contact_slot: "primary" }}
                    formData={{}}
                    updateFormData={vi.fn()}
                    isUpdatingStatus={false}
                    handleStatusChange={() => {}}
                    onRequestEdit={vi.fn()}
                />
            </LanguageProvider>,
        );
        expect(screen.queryByText("تحديد رقم الواتساب")).toBeNull();
    });

    it("labels the shortcut as adding a number when there is no secondary", () => {
        render(
            <LanguageProvider>
                <OrderCustomerCard
                    isEditing={false}
                    order={baseOrder}
                    formData={{}}
                    updateFormData={vi.fn()}
                    isUpdatingStatus={false}
                    handleStatusChange={() => {}}
                    onRequestEdit={vi.fn()}
                />
            </LanguageProvider>,
        );
        expect(screen.getByText("إضافة رقم واتساب")).toBeTruthy();
    });

    it("swaps both numbers and carries the designation with the number", () => {
        const { updateFormData } = renderCard(
            { ...withSecondary, whatsapp_contact_slot: "secondary" },
            { isEditing: true },
        );

        fireEvent.click(screen.getByTitle("تبديل الرقم الأساسي والثانوي"));

        expect(updateFormData).toHaveBeenCalledWith("phone", "07811262261");
        expect(updateFormData).toHaveBeenCalledWith("secondary_phone", "07727838391");
        // The customer's chosen line became the primary, so the slot must follow it.
        expect(updateFormData).toHaveBeenCalledWith("whatsapp_contact_slot", "primary");
    });

    it("cannot swap when there is no secondary number to promote", () => {
        renderCard({}, { isEditing: true });
        expect(screen.getByTitle("تبديل الرقم الأساسي والثانوي").hasAttribute("disabled")).toBe(true);
    });

    it("designates a slot, and un-designates it on a second press", () => {
        const { updateFormData } = renderCard(withSecondary, { isEditing: true });
        // Both slots offer the toggle when both hold a number; the first is primary.
        const toggles = screen.getAllByTitle("اجعله رقم الواتساب المعتمد");
        expect(toggles).toHaveLength(2);
        fireEvent.click(toggles[0]);
        expect(updateFormData).toHaveBeenCalledWith("whatsapp_contact_slot", "primary");

        cleanup();
        const second = renderCard(
            { ...withSecondary, whatsapp_contact_slot: "primary" },
            { isEditing: true },
        );
        fireEvent.click(screen.getByTitle("إلغاء تحديده كرقم واتساب"));
        expect(second.updateFormData).toHaveBeenCalledWith("whatsapp_contact_slot", null);
    });

    it("disables designating a slot with no number behind it", () => {
        renderCard({}, { isEditing: true });
        expect(screen.getByTitle("أدخل الرقم أولاً").hasAttribute("disabled")).toBe(true);
    });
});
