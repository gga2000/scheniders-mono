/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Order } from "@/types/order";

const H = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
    toast: { error: H.toastError, success: H.toastSuccess },
}));

import { useOrderDetailsForm } from "./use-order-details-form";
import { FUTURE_ORDER_DATE_CODE } from "@/lib/order-date-guard";

const order = {
    id: "o1",
    order_id: "7309",
    customer_name: "علي",
    phone: "07727838391",
    created_at: "2026-09-07T05:46:00.000Z",
    scheduled_date: null,
    status: "confirmed",
    price: 1000,
    items: [],
} as unknown as Order;

const t = (key: string) => key;

const setup = (onUpdate: ReturnType<typeof vi.fn>) => {
    const setOrder = vi.fn();
    const hook = renderHook(() => useOrderDetailsForm({ order, setOrder, onUpdate, t }));
    act(() => hook.result.current.handleEdit());
    return { hook, setOrder };
};

beforeEach(() => {
    H.toastError.mockReset();
    H.toastSuccess.mockReset();
});

describe("useOrderDetailsForm — order date vs schedule", () => {
    it("refuses a future order date before saving, against the field, and keeps the edits", async () => {
        const onUpdate = vi.fn();
        const { hook } = setup(onUpdate);

        act(() => {
            hook.result.current.updateFormData("customer_name", "علي واثق");
            hook.result.current.updateFormData("created_at", new Date(Date.now() + 86_400_000).toISOString());
        });
        await act(() => hook.result.current.handleSave());

        expect(onUpdate).not.toHaveBeenCalled();
        expect(hook.result.current.orderDateError).toBe("orderDetail.futureDateBlocked");
        expect(hook.result.current.isEditing).toBe(true);
        expect(hook.result.current.formData.customer_name).toBe("علي واثق");
        expect(H.toastError).not.toHaveBeenCalled();
    });

    it("shows the database's refusal against the field rather than as a toast", async () => {
        const onUpdate = vi.fn().mockResolvedValue({ success: false, error: "x", code: FUTURE_ORDER_DATE_CODE });
        const { hook } = setup(onUpdate);

        act(() => hook.result.current.updateFormData("customer_name", "علي واثق"));
        await act(() => hook.result.current.handleSave());

        expect(hook.result.current.orderDateError).toBe("orderDetail.futureDateBlocked");
        expect(hook.result.current.isEditing).toBe(true);
        expect(hook.result.current.formData.customer_name).toBe("علي واثق");
        expect(H.toastError).not.toHaveBeenCalled();
    });

    it("saves a schedule without touching created_at", async () => {
        const onUpdate = vi.fn().mockResolvedValue({ success: true });
        const { hook } = setup(onUpdate);

        act(() => hook.result.current.updateFormData("scheduled_date", "2026-09-10"));
        await act(() => hook.result.current.handleSave());

        const sent = onUpdate.mock.calls[0][1] as Partial<Order>;
        expect(sent.scheduled_date).toBe("2026-09-10");
        expect(sent).not.toHaveProperty("created_at");
        expect(hook.result.current.isEditing).toBe(false);
    });

    it("does not send an unchanged schedule", async () => {
        const onUpdate = vi.fn().mockResolvedValue({ success: true });
        const { hook } = setup(onUpdate);

        act(() => hook.result.current.updateFormData("customer_name", "علي واثق"));
        await act(() => hook.result.current.handleSave());

        expect(onUpdate.mock.calls[0][1]).not.toHaveProperty("scheduled_date");
    });
});
