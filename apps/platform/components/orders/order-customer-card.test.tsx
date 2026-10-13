/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/types/order";
import { OrderCustomerCard } from "./order-customer-card";

afterEach(cleanup);

// 12:00 Baghdad on 7 Sep 2026 — still 7 Sep on the local calendar of any
// runner between UTC-9 and UTC+14, which is what the date picker draws.
const NOW = new Date("2026-09-07T09:00:00.000Z");

const baseOrder = {
    id: "o1",
    order_id: "7309",
    customer_name: "علي واثق",
    phone: "07727838391",
    city: "بغداد",
    address_details: "حي العامل",
    created_at: "2026-09-07T05:46:00.000Z",
    original_created_at: null,
    scheduled_date: null,
    delivery_slot: null,
    payment_status: "cod",
    status: "confirmed",
    price: 44750,
    items: [],
} as unknown as Order;

const renderCard = (
    overrides: Partial<Order> = {},
    {
        isEditing = false,
        updateFormData = vi.fn(),
        formData = {},
        orderDateError = null,
    }: { isEditing?: boolean; updateFormData?: ReturnType<typeof vi.fn>; formData?: Partial<Order>; orderDateError?: string | null } = {},
) => {
    const order = { ...baseOrder, ...overrides } as Order;
    render(
        <LanguageProvider>
            <OrderCustomerCard
                isEditing={isEditing}
                order={order}
                formData={formData}
                updateFormData={updateFormData}
                isUpdatingStatus={false}
                handleStatusChange={() => {}}
                orderDateError={orderDateError}
            />
        </LanguageProvider>,
    );
    return { updateFormData };
};

const openOrderDatePicker = () => {
    // The order-date picker is the first one in the card and shows September.
    const trigger = screen.getAllByRole("button").find((b) => /سبتمبر/.test(b.textContent || ""));
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger as HTMLElement);
    return { trigger: trigger as HTMLElement, dialog: screen.getByRole("dialog") };
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

    it("says today when the scheduled day has arrived", () => {
        renderCard({ scheduled_date: "2026-09-07" });
        expect(screen.getByText(/اليوم/)).toBeTruthy();
    });

    it("explains where postponing lives, under the order date", () => {
        renderCard({}, { isEditing: true });
        expect(screen.getByText(/لتأجيل الطلب استخدم «مجدول لـ» بالأسفل/)).toBeTruthy();
    });

    it("writes the schedule, not the order date, when postponing to tomorrow", () => {
        const { updateFormData } = renderCard({}, { isEditing: true });
        fireEvent.click(screen.getByRole("button", { name: "غداً" }));
        expect(updateFormData).toHaveBeenCalledWith("scheduled_date", "2026-09-08");
        expect(updateFormData).not.toHaveBeenCalledWith("created_at", expect.anything());
    });

    it("postpones by three Baghdad days", () => {
        const { updateFormData } = renderCard({}, { isEditing: true });
        fireEvent.click(screen.getByRole("button", { name: "بعد ٣ أيام" }));
        expect(updateFormData).toHaveBeenCalledWith("scheduled_date", "2026-09-10");
    });

    it("clears the schedule", () => {
        const { updateFormData } = renderCard({ scheduled_date: "2026-09-09" }, { isEditing: true });
        fireEvent.click(screen.getByRole("button", { name: /إزالة/ }));
        expect(updateFormData).toHaveBeenCalledWith("scheduled_date", null);
    });

    // The bug this whole change exists to stop: dating an order into the future.
    it("will not offer a future day in the order-date picker", () => {
        renderCard({}, { isEditing: true });
        const { dialog } = openOrderDatePicker();
        expect((within(dialog).getByRole("button", { name: "7" }) as HTMLButtonElement).disabled).toBe(false);
        expect((within(dialog).getByRole("button", { name: "8" }) as HTMLButtonElement).disabled).toBe(true);
    });

    // The bound is read at interaction time, so a form left open does not clamp
    // against a stale clock.
    it("keeps the future cut-off current while the form stays open", () => {
        renderCard({}, { isEditing: true });
        const { trigger, dialog: firstDialog } = openOrderDatePicker();
        let dialog = firstDialog;
        expect((within(dialog).getByRole("button", { name: "8" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(dialog, { key: "Escape" });

        // A day later, with the card still open.
        vi.setSystemTime(new Date("2026-09-08T09:00:00.000Z"));
        fireEvent.click(trigger);
        dialog = screen.getByRole("dialog");
        expect((within(dialog).getByRole("button", { name: "8" }) as HTMLButtonElement).disabled).toBe(false);
        expect((within(dialog).getByRole("button", { name: "9" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows a refused future date against the field, in place of the hint", () => {
        renderCard({}, { isEditing: true, orderDateError: "لا يمكن أن يكون تاريخ الطلب في المستقبل." });
        expect(screen.getByRole("alert").textContent).toContain("لا يمكن أن يكون تاريخ الطلب في المستقبل");
        expect(screen.queryByText(/لتأجيل الطلب استخدم/)).toBeNull();
    });
});

describe("OrderCustomerCard WhatsApp contact designation", () => {
    // `whatsapp_contact_slot: null` = read from a source that has the column and
    // nothing is designated; leaving the key out = the value is unknown.
    const known = { whatsapp_contact_slot: null } as Partial<Order>;
    const withSecondary = { ...known, secondary_phone: "07811262261" };

    const renderView = (order: Partial<Order>, onRequestEdit = vi.fn()) =>
        render(
            <LanguageProvider>
                <OrderCustomerCard
                    isEditing={false}
                    order={{ ...baseOrder, ...order } as Order}
                    formData={{}}
                    updateFormData={vi.fn()}
                    isUpdatingStatus={false}
                    handleStatusChange={() => {}}
                    onRequestEdit={onRequestEdit}
                />
            </LanguageProvider>,
        );

    it("badges the designated number in view mode", () => {
        renderCard({ ...withSecondary, whatsapp_contact_slot: "secondary" });
        expect(screen.getAllByText("واتساب").length).toBeGreaterThan(0);
    });

    it("offers the shortcut into editing only while nothing is designated", () => {
        const onRequestEdit = vi.fn();
        renderView(withSecondary, onRequestEdit);
        fireEvent.click(screen.getByText("تحديد رقم الواتساب"));
        expect(onRequestEdit).toHaveBeenCalled();

        cleanup();
        renderView({ ...withSecondary, whatsapp_contact_slot: "primary" });
        expect(screen.queryByText("تحديد رقم الواتساب")).toBeNull();
    });

    it("labels the shortcut as adding a number when there is no secondary", () => {
        renderView(known);
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
        renderCard(known, { isEditing: true });
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
        renderCard(known, { isEditing: true });
        expect(screen.getByTitle("أدخل الرقم أولاً").hasAttribute("disabled")).toBe(true);
    });

    it("hides every designation control when the row does not carry the slot", () => {
        // The detail view before 20261014120000: acting here could swap or clear
        // a designation the card cannot see.
        renderCard({ secondary_phone: "07811262261" }, { isEditing: true });
        expect(screen.queryByTitle("تبديل الرقم الأساسي والثانوي")).toBeNull();
        expect(screen.queryByTitle("اجعله رقم الواتساب المعتمد")).toBeNull();

        cleanup();
        renderView({ secondary_phone: "07811262261" });
        expect(screen.queryByText("تحديد رقم الواتساب")).toBeNull();
    });
});
