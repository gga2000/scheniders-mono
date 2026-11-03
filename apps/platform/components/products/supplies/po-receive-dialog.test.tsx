import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Line = { id: string; productName: string; quantityOrdered: number; quantityReceived: number };
let lines: Line[] = [];
const mutate = vi.fn();

vi.mock("@/lib/repositories/purchase-orders", () => ({
    fetchPurchaseOrderLines: async () => lines.map((l) => ({ ...l })),
}));
vi.mock("@/hooks/use-purchase-order-actions", () => ({
    usePurchaseOrderActions: () => ({ receive: { mutate, isPending: false } }),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PoReceiveDialog } from "./po-receive-dialog";

afterEach(() => {
    cleanup();
    mutate.mockReset();
});

const submitAndGetRequestId = async () => {
    const button = await screen.findByRole("button", { name: "supplies.po.receiveSubmit" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    return (mutate.mock.calls.at(-1)?.[0] as { requestId: string }).requestId;
};

describe("PoReceiveDialog request id", () => {
    it("keeps the id while the lines are unchanged and renews it once they reload changed", async () => {
        lines = [{ id: "l1", productName: "Box", quantityOrdered: 10, quantityReceived: 0 }];
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={client}>
                <PoReceiveDialog open onOpenChange={vi.fn()} poId="po1" poNumber="PO-1" />
            </QueryClientProvider>,
        );

        // The response was lost: the call failed in the client, nothing landed.
        const first = await submitAndGetRequestId();
        mutate.mock.calls.at(-1)?.[1]?.onError?.(new Error("network"));
        expect(await submitAndGetRequestId()).toBe(first);

        // The first call did land: the reloaded lines show it, so the next receipt is new.
        lines = [{ id: "l1", productName: "Box", quantityOrdered: 10, quantityReceived: 4 }];
        await client.invalidateQueries({ queryKey: ["po-lines", "po1"] });
        await waitFor(async () => expect(await submitAndGetRequestId()).not.toBe(first));
    });
});
