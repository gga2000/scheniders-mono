import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Product } from "@/lib/supabase";
import { formatIQD } from "@/lib/utils";

const createPurchaseOrder = vi.fn();
let draftBySupply = new Map<string, { id: string; number: string; quantity: number; unitCost: number | null }>();
let draftBySupplier = new Map<string, { id: string; number: string }>();

vi.mock("@/lib/repositories/purchase-orders", () => ({
    createPurchaseOrder: (...args: unknown[]) => createPurchaseOrder(...args),
}));
vi.mock("@/hooks/use-draft-pos-by-supply", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/hooks/use-draft-pos-by-supply")>()),
    useDraftPosBySupply: () => ({ data: draftBySupply }),
    useDraftPoBySupplier: () => ({ data: draftBySupplier }),
}));
vi.mock("@/hooks/use-purchase-order-actions", () => ({
    usePurchaseOrderActions: () => ({ changeStatus: { mutate: vi.fn(), isPending: false } }),
}));
vi.mock("./po-send-confirm-dialog", () => ({ PoSendConfirmDialog: () => null }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "t1" }) }));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => true }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        t: (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k),
        language: "en",
    }),
    useTextDir: () => "ltr",
}));

import { ReorderDrawer } from "./reorder-drawer";

afterEach(() => {
    cleanup();
    createPurchaseOrder.mockReset();
    draftBySupply = new Map();
    draftBySupplier = new Map();
});

const supply = (id: string, name: string): Product =>
    ({
        id,
        name,
        sku: id.toUpperCase(),
        is_supply: true,
        stock_quantity: 1,
        reserved_quantity: 0,
        reorder_point: 10,
        times_sold_30d: 30,
        cost: 300,
        suppliers: [{ supplier_name: "Acme", is_primary: true, unit_cost: 300, lead_time_days: 7, minimum_order_quantity: 1 }],
    }) as unknown as Product;

const renderDrawer = () =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <ReorderDrawer
                open
                onClose={vi.fn()}
                supplies={[supply("s1", "Glass bottle"), supply("s2", "Box")]}
                snoozedIds={new Set()}
                onSnooze={vi.fn()}
                onUnsnooze={vi.fn()}
            />
        </QueryClientProvider>,
    );

describe("ReorderDrawer with a supplier draft", () => {
    it("adds only the supplies the draft does not list yet to that draft", async () => {
        draftBySupply = new Map([["s1", { id: "po1", number: "PO-1", quantity: 500, unitCost: 250 }]]);
        draftBySupplier = new Map([["acme", { id: "po1", number: "PO-1" }]]);
        createPurchaseOrder.mockResolvedValue({ id: "po1", poNumber: "PO-1" });
        renderDrawer();

        fireEvent.click(await screen.findByText(/supplies\.ro\.addToDraft/));
        await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalledTimes(1));
        const { lines, supplierName } = createPurchaseOrder.mock.calls[0][0] as { lines: { productId: string }[]; supplierName: string };
        expect(supplierName).toBe("Acme");
        expect(lines.map((l) => l.productId)).toEqual(["s2"]);
    });

    it("prices the drafted line at the draft's price and totals it apart from what would be added", async () => {
        draftBySupply = new Map([["s1", { id: "po1", number: "PO-1", quantity: 500, unitCost: 250 }]]);
        draftBySupplier = new Map([["acme", { id: "po1", number: "PO-1" }]]);
        renderDrawer();

        const split = await screen.findByText(/supplies\.ro\.splitTotal/);
        expect(split.textContent).toContain(JSON.stringify(formatIQD(125_000)).slice(1, -1));
        // The drafted row shows the draft's price, not today's 300.
        expect(document.body.textContent).toContain(`× ${formatIQD(250)}`);
        expect(document.body.textContent).not.toContain(`500} × ${formatIQD(300)}`);
    });

    it("starts a new PO with every supply when the supplier has no draft", async () => {
        createPurchaseOrder.mockResolvedValue({ id: "po2", poNumber: "PO-2" });
        renderDrawer();

        expect(screen.queryByText(/supplies\.ro\.splitTotal/)).toBeNull();
        fireEvent.click(await screen.findByText(/supplies\.ro\.createPo|supplies\.ro\.generate/));
        await waitFor(() => expect(createPurchaseOrder).toHaveBeenCalledTimes(1));
        const { lines } = createPurchaseOrder.mock.calls[0][0] as { lines: { productId: string }[] };
        expect(lines.map((l) => l.productId).sort()).toEqual(["s1", "s2"]);
    });
});
