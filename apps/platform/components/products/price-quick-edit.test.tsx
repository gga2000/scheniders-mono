import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Product } from "@/lib/supabase";

const mutateAsync = vi.fn();
const addPriceHistoryEntry = vi.fn();

vi.mock("@/hooks/use-products-query", () => ({
    useUpdateProductMutation: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/lib/repositories/product-repository", () => ({
    productRepository: { addPriceHistoryEntry: (...args: unknown[]) => addPriceHistoryEntry(...args) },
}));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("@/hooks/use-toast", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import { PriceQuickEdit } from "./price-quick-edit";

const product = {
    id: "p1",
    name: "Oud",
    price: 25000,
    updated_at: "2026-10-31T10:00:00Z",
} as Product;

beforeEach(() => {
    mutateAsync.mockResolvedValue({ id: "p1" });
    addPriceHistoryEntry.mockResolvedValue(undefined);
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("PriceQuickEdit", () => {
    it("saves against the loaded updated_at and records the price history", async () => {
        const onClose = vi.fn();
        render(<PriceQuickEdit product={product} onClose={onClose} />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "30,000" } });
        fireEvent.submit(screen.getByRole("textbox").closest("form") as HTMLFormElement);

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(mutateAsync).toHaveBeenCalledWith({
            id: "p1",
            data: { price: 30000 },
            expectedUpdatedAt: "2026-10-31T10:00:00Z",
        });
        expect(addPriceHistoryEntry).toHaveBeenCalledWith(
            "p1",
            expect.objectContaining({ old_price: 25000, new_price: 30000 }),
            "tenant-1",
        );
    });

    it("does not write when the price is unchanged", async () => {
        const onClose = vi.fn();
        render(<PriceQuickEdit product={product} onClose={onClose} />);
        fireEvent.submit(screen.getByRole("textbox").closest("form") as HTMLFormElement);

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(mutateAsync).not.toHaveBeenCalled();
        expect(addPriceHistoryEntry).not.toHaveBeenCalled();
    });

    it("keeps save disabled for zero or non-numbers, and warns below cost", () => {
        render(<PriceQuickEdit product={product} cost={20000} onClose={vi.fn()} />);
        const input = screen.getByRole("textbox");
        const save = screen.getByRole("button", { name: "products.priceEdit.save" });

        fireEvent.change(input, { target: { value: "0" } });
        expect((save as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(input, { target: { value: "abc" } });
        expect((save as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(input, { target: { value: "15000" } });
        expect((save as HTMLButtonElement).disabled).toBe(false);
        expect(screen.queryByText("products.priceEdit.belowCost")).not.toBeNull();
    });

    it("clears a compare-at price that the new price reaches or passes", async () => {
        const onClose = vi.fn();
        const withCompare = { ...product, compare_at_price: 28000 } as Product;
        render(<PriceQuickEdit product={withCompare} onClose={onClose} />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "30000" } });
        fireEvent.submit(screen.getByRole("textbox").closest("form") as HTMLFormElement);

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({ data: { price: 30000, compare_at_price: null } }),
        );
    });

    it("keeps a compare-at price that is still above the new price", async () => {
        const onClose = vi.fn();
        const withCompare = { ...product, compare_at_price: 40000 } as Product;
        render(<PriceQuickEdit product={withCompare} onClose={onClose} />);
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "30000" } });
        fireEvent.submit(screen.getByRole("textbox").closest("form") as HTMLFormElement);

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ data: { price: 30000 } }));
    });
});
