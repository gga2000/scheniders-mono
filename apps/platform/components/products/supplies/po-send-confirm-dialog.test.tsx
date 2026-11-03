import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/repositories/purchase-orders", () => ({
    fetchPurchaseOrderLines: async () => [
        { id: "l1", productId: "p1", productName: "Gift box", variantName: null, sku: null, quantityOrdered: 40, quantityReceived: 0 },
    ],
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));

import { PoSendConfirmDialog } from "./po-send-confirm-dialog";

afterEach(cleanup);

describe("PoSendConfirmDialog", () => {
    it("shows the draft's lines before sending, and sends only on confirm", async () => {
        const onSend = vi.fn();
        render(
            <QueryClientProvider client={new QueryClient()}>
                <PoSendConfirmDialog open onOpenChange={vi.fn()} poId="po1" poNumber="PO-1" sending={false} onSend={onSend} />
            </QueryClientProvider>,
        );
        expect(await screen.findByText("Gift box")).toBeTruthy();
        expect(screen.getByText("× 40")).toBeTruthy();
        expect(onSend).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "supplies.ro.sendDraft" }));
        expect(onSend).toHaveBeenCalledTimes(1);
    });
});
