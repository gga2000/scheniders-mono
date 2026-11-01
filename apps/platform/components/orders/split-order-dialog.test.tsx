/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/lib/supabase";
import { SplitOrderDialog } from "./split-order-dialog";

const toastError = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

afterEach(() => { cleanup(); toastError.mockReset(); });

const order = {
    id: "o1", order_id: "9001", price: 75000, delivery_fee: 5000, discount_amount: 0,
    items: [
        { product_id: "p1", name: "Serum", sku: "S1", quantity: 1, price: 25000 },
        { product_id: "p2", name: "Cream", sku: "C1", quantity: 1, price: 50000 },
    ],
} as unknown as Order;

function setup(onConfirm: () => Promise<boolean>) {
    const onClose = vi.fn();
    render(<LanguageProvider><SplitOrderDialog order={order} open onClose={onClose} onConfirm={onConfirm} /></LanguageProvider>);
    // Move "Serum" to the returned side, then confirm.
    fireEvent.click(screen.getByText("Serum"));
    const confirm = screen.getAllByRole("button").find((b) => /Split and create|تأكيد التقسيم/.test(b.textContent ?? ""));
    if (!confirm) throw new Error("confirm button not found");
    fireEvent.click(confirm);
    return { onClose };
}

describe("SplitOrderDialog", () => {
    it("closes once the split goes through", async () => {
        const { onClose } = setup(async () => true);
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("stays open with the items as arranged when the split is refused", async () => {
        const onConfirm = vi.fn(async () => false);
        const { onClose } = setup(onConfirm);
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
        expect(onClose).not.toHaveBeenCalled();
        // Serum is still on the returned side (its row offers to move it back).
        const returned = screen.getAllByTitle(/Back to received|إرجاع للاستلام/);
        expect(returned.map((r) => r.textContent).join(" ")).toMatch(/Serum/);
    });

    it("tells the operator when the request itself fails, and stays open", async () => {
        const { onClose } = setup(async () => { throw new Error("network down"); });
        await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
        expect(toastError.mock.calls[0][1]).toBe("network down");
        expect(onClose).not.toHaveBeenCalled();
    });
});
