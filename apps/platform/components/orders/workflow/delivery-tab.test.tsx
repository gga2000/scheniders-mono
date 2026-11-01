/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/lib/supabase";
import { DeliveryTab } from "./delivery-tab";

afterEach(cleanup);

const order = {
    id: "o1", order_id: "9001", status: "in_transit", customer_name: "Ali", phone: "07701234567", city: "Baghdad",
    price: 75000, delivery_fee: 5000, notes: "Call before noon",
    items: [{ product_id: "p1", name: "Serum", sku: "S1", quantity: 2, price: 25000 }],
    created_at: new Date().toISOString(),
} as unknown as Order;

describe("DeliveryTab partial delivery", () => {
    it("adds the partial note under the order's existing notes instead of replacing them", async () => {
        const onUpdate = vi.fn(async () => ({ success: true }));
        const onStatusUpdate = vi.fn(async () => ({ success: true }));
        render(<LanguageProvider><DeliveryTab orders={[order]} onUpdate={onUpdate} onStatusUpdate={onStatusUpdate} onViewDetails={vi.fn()} /></LanguageProvider>);

        fireEvent.click(screen.getByRole("button", { name: /Partial|جزئي/ }));
        fireEvent.click(screen.getByRole("button", { name: "−" }));
        fireEvent.click(screen.getByRole("button", { name: /^(Confirm|تأكيد)$/ }));

        await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
        expect(onStatusUpdate).toHaveBeenCalledWith("o1", "delivered");
        expect(onUpdate).toHaveBeenCalledWith("o1", { notes: "Call before noon\nPartial: Serum: 1/2" });
    });
});
