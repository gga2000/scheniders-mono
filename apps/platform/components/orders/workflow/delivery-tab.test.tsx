/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/lib/supabase";

const splitOrder = vi.fn(async () => ({ success: true }));
vi.mock("@/components/providers/orders-provider", () => ({ useOrdersContext: () => ({ splitOrder }) }));

import { DeliveryTab } from "./delivery-tab";

afterEach(() => { cleanup(); splitOrder.mockClear(); });

const order = {
    id: "o1", order_id: "9001", status: "in_transit", customer_name: "Ali", phone: "07701234567", city: "Baghdad",
    price: 100000, delivery_fee: 5000, notes: "Call before noon",
    items: [
        { product_id: "p1", name: "Serum", sku: "S1", quantity: 2, price: 25000 },
        { product_id: "p2", name: "Cream", sku: "C1", quantity: 1, price: 50000 },
    ],
    created_at: new Date().toISOString(),
} as unknown as Order;

describe("DeliveryTab partial delivery", () => {
    it("splits the order so only the received items are booked as delivered", async () => {
        const onStatusUpdate = vi.fn(async () => ({ success: true }));
        render(<LanguageProvider><DeliveryTab orders={[order]} onStatusUpdate={onStatusUpdate} onViewDetails={vi.fn()} /></LanguageProvider>);

        fireEvent.click(screen.getByRole("button", { name: /Partial|جزئي/ }));
        // One of the two serums comes back.
        fireEvent.click(screen.getAllByRole("button", { name: "−" })[0]);
        fireEvent.click(screen.getByRole("button", { name: /^(Confirm|تأكيد)$/ }));

        await waitFor(() => expect(splitOrder).toHaveBeenCalledTimes(1));
        expect(splitOrder).toHaveBeenCalledWith(
            "o1",
            [
                expect.objectContaining({ product_id: "p1", quantity: 1 }),
                expect.objectContaining({ product_id: "p2", quantity: 1 }),
            ],
            [expect.objectContaining({ product_id: "p1", quantity: 1 })],
        );
        // The whole order is never marked delivered at full price.
        expect(onStatusUpdate).not.toHaveBeenCalled();
    });

    it("marks the order delivered as usual when everything was accepted", async () => {
        const onStatusUpdate = vi.fn(async () => ({ success: true }));
        render(<LanguageProvider><DeliveryTab orders={[order]} onStatusUpdate={onStatusUpdate} onViewDetails={vi.fn()} /></LanguageProvider>);
        fireEvent.click(screen.getByRole("button", { name: /Partial|جزئي/ }));
        fireEvent.click(screen.getByRole("button", { name: /^(Confirm|تأكيد)$/ }));
        await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledWith("o1", "delivered"));
        expect(splitOrder).not.toHaveBeenCalled();
    });
});
