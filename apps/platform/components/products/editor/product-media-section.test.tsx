// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductMediaSection } from "./product-media-section";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("../product-image-upload", () => ({ ProductImageUpload: () => null }));
vi.mock("../product-gallery-section", () => ({ ProductGallerySection: () => null }));
vi.mock("@/lib/upload-product-image", () => ({ uploadProductImage: vi.fn() }));

afterEach(cleanup);

const form = { image_url: "https://img.example/p.jpg", is_supply: false } as ProductEditorFormData;

describe("ProductMediaSection image editor", () => {
    it("opens and closes the editor without breaking the hook order", () => {
        render(<ProductMediaSection formData={form} updateField={vi.fn()} productId="p1" />);
        expect(screen.queryByText("products.img.title")).toBeNull();

        fireEvent.click(screen.getByText("products.ed.editImage"));
        expect(screen.getByText("products.img.title")).toBeTruthy();

        fireEvent.click(screen.getByText("products.img.cancel"));
        expect(screen.queryByText("products.img.title")).toBeNull();

        fireEvent.click(screen.getByText("products.ed.editImage"));
        expect(screen.getByText("products.img.title")).toBeTruthy();
    });
});
