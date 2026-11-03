import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        t: (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k),
        language: "en",
    }),
}));

import { BulkActionsBar } from "./bulk-actions-bar";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const renderBar = (onUpdatePrice: (p: number) => Promise<void>, belowCostNames: string[]) =>
    render(
        <BulkActionsBar
            selectedCount={2}
            onUpdatePrice={onUpdatePrice}
            describePrice={() => ({ clearsCompareAt: 0, keepsStorePrice: 0, belowCostNames })}
            onArchive={vi.fn()}
            onExport={vi.fn()}
            onClearSelection={vi.fn()}
            onUndo={vi.fn()}
        />,
    );

const typePrice = (value: string) => {
    fireEvent.click(screen.getByLabelText("products.bulk.updatePrice"));
    fireEvent.change(screen.getByPlaceholderText("products.bulk.newPrice"), { target: { value } });
};

describe("BulkActionsBar price", () => {
    it("asks a second time before selling below cost", async () => {
        const onUpdatePrice = vi.fn().mockResolvedValue(undefined);
        renderBar(onUpdatePrice, ["Coco Mademoiselle"]);
        typePrice("1000");
        // The warning names the product that would sell at a loss.
        expect(screen.getByText(/products\.bulk\.priceBelowCostOne.*Coco Mademoiselle/)).toBeTruthy();
        fireEvent.click(screen.getByText("products.bulk.apply"));
        expect(onUpdatePrice).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("products.bulk.applyAnyway"));
        await waitFor(() => expect(onUpdatePrice).toHaveBeenCalledWith(1000));
    });

    it("applies at once when nothing goes below cost, with one notice (the undo bar)", async () => {
        const onUpdatePrice = vi.fn().mockResolvedValue(undefined);
        renderBar(onUpdatePrice, []);
        typePrice("50000");
        fireEvent.click(screen.getByText("products.bulk.apply"));
        await waitFor(() => expect(onUpdatePrice).toHaveBeenCalledWith(50000));
        expect(toast.success).not.toHaveBeenCalled();
    });
});
