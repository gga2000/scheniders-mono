/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { useLanguage } from "@/hooks/use-language";
import { useStatusLabel } from "@/hooks/use-status-label";
import type { Order } from "@/lib/supabase";
import { OrderDetailsStatusSection } from "./order-details-status-section";
import { OrderDetailsFooterSection } from "./order-details-footer-section";
import type { OrderDetailsView } from "./use-order-details-model";

afterEach(cleanup);

const baseOrder = {
    id: "o1",
    order_id: "7309",
    customer_name: "علي واثق",
    phone: "07727838391",
    status: "new",
    is_return: false,
    price: 44750,
    items: [],
} as unknown as Order;

/**
 * The view a section reads, with only the fields these sections use. The
 * model itself needs auth and query providers; the sections only read it.
 */
function Section({ part, order, handlers }: { part: "status" | "footer"; order: Order; handlers: Record<string, unknown> }) {
    const { t } = useLanguage();
    const orderStatusLabel = useStatusLabel();
    const m = {
        order,
        t,
        orderStatusLabel,
        onStatusUpdate: vi.fn(),
        onClose: vi.fn(),
        isEditing: false,
        isUpdatingStatus: false,
        isSendingTemplate: false,
        isSaving: false,
        showDeleteConfirm: false,
        primeEdit: { review: null },
        formData: {},
        handleStatusChange: vi.fn(),
        handleWhatsApp: vi.fn(),
        handleSendTemplate: vi.fn(),
        setShowSplitDialog: vi.fn(),
        ...handlers,
    } as unknown as OrderDetailsView;
    return part === "status" ? <OrderDetailsStatusSection m={m} /> : <OrderDetailsFooterSection m={m} />;
}

const renderPart = (part: "status" | "footer", order: Partial<Order> = {}, handlers: Record<string, unknown> = {}) =>
    render(
        <LanguageProvider>
            <Section part={part} order={{ ...baseOrder, ...order } as Order} handlers={handlers} />
        </LanguageProvider>,
    );

describe("order window status row", () => {
    it("moves the order on with one button", () => {
        const handleStatusChange = vi.fn();
        renderPart("status", { status: "new" }, { handleStatusChange });
        fireEvent.click(screen.getByText("التالي: تم الاتصال"));
        expect(handleStatusChange).toHaveBeenCalledWith("contacted");
    });

    it("keeps every other status in one menu", () => {
        renderPart("status", { status: "confirmed" });
        expect(screen.getByText("التالي: قيد التوصيل")).toBeTruthy();
        expect(screen.getByText("تغيير الحالة")).toBeTruthy();
        // The twelve status buttons are gone from the window itself.
        expect(document.querySelectorAll("[data-status-option]")).toHaveLength(0);
    });

    it("offers only the menu once the order has ended", () => {
        renderPart("status", { status: "completed" });
        expect(document.querySelector("[data-next-status]")).toBeNull();
        expect(screen.getByText("تغيير الحالة")).toBeTruthy();
    });
});

describe("order window footer", () => {
    it("keeps the total in view, written in the UI language", () => {
        renderPart("footer");
        const total = document.querySelector("[data-order-total]")?.textContent ?? "";
        expect(total).toContain("المجموع الكلي");
        expect(total).toContain("44,750 د.ع");
    });

    it("shows the confirmation template as the one strong button on a new order", () => {
        const handleSendTemplate = vi.fn();
        renderPart("footer", { status: "new" }, { handleSendTemplate });
        fireEvent.click(screen.getByText("إرسال قالب التأكيد"));
        expect(handleSendTemplate).toHaveBeenCalled();
        expect(screen.getByText("فتح واتساب")).toBeTruthy();
    });

    it("leaves the template out once the order has moved on", () => {
        renderPart("footer", { status: "confirmed" });
        expect(screen.queryByText("إرسال قالب التأكيد")).toBeNull();
        expect(screen.getByText("فتح واتساب")).toBeTruthy();
    });
});
