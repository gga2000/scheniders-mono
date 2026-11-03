// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductInventorySection } from "./product-inventory-section";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }), useTextDir: () => "ltr" }));

afterEach(cleanup);

function form(storefront_stock: number | null): ProductEditorFormData {
    return { stock_quantity: 7, low_stock_threshold: 5, is_supply: false, storefront_stock } as ProductEditorFormData;
}

describe("ProductInventorySection storefront stock toggle", () => {
    it("is off when the store follows real stock, and turning on starts from the available count", () => {
        const updateField = vi.fn();
        render(<ProductInventorySection formData={form(null)} updateField={updateField} reservedQuantity={5} />);
        expect(screen.queryByLabelText("products.ed.storefrontStock")).toBeNull();

        fireEvent.click(screen.getByRole("switch"));
        expect(updateField).toHaveBeenCalledWith("storefront_stock", 2);
    });

    it("is on with a custom number, and turning off clears it", () => {
        const updateField = vi.fn();
        render(<ProductInventorySection formData={form(36)} updateField={updateField} />);
        expect((screen.getByLabelText("products.ed.storefrontStock") as HTMLInputElement).value).toBe("36");

        fireEvent.click(screen.getByRole("switch"));
        expect(updateField).toHaveBeenCalledWith("storefront_stock", null);
    });

    it("an emptied box stays on as 0 instead of silently following real stock", () => {
        const updateField = vi.fn();
        render(<ProductInventorySection formData={form(36)} updateField={updateField} />);
        fireEvent.change(screen.getByLabelText("products.ed.storefrontStock"), { target: { value: "" } });
        expect(updateField).toHaveBeenCalledWith("storefront_stock", 0);
    });
});
