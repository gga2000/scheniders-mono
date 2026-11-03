import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/repositories/purchase-orders", () => ({
    fetchPurchaseOrderLines: async () => [
        { id: "l1", productId: "p1", productName: "Gift box", variantName: null, sku: null, quantityOrdered: 40, quantityReceived: 0 },
    ],
}));
vi.mock("@/lib/repositories/purchase-costs", () => ({
    fetchPurchaseOrderLineCosts: async () => new Map([["l1", 500]]),
}));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }), useTextDir: () => "ltr" }));

import { PoSendConfirmDialog } from "./po-send-confirm-dialog";

afterEach(cleanup);

describe("PoSendConfirmDialog", () => {
    it("shows the draft's lines, prices and total before sending, and sends only on confirm", async () => {
        const onSend = vi.fn();
        render(
            <QueryClientProvider client={new QueryClient()}>
                <PoSendConfirmDialog open onOpenChange={vi.fn()} poId="po1" poNumber="PO-1" sending={false} onSend={onSend} />
            </QueryClientProvider>,
        );
        expect(await screen.findByText("Gift box")).toBeTruthy();
        expect(await screen.findByText(/× 40 · .*500/)).toBeTruthy();
        // The total the supplier will charge: 40 x 500.
        expect(await screen.findByText(/20,000/)).toBeTruthy();
        expect(onSend).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "supplies.ro.sendDraft" }));
        expect(onSend).toHaveBeenCalledTimes(1);
    });
});
