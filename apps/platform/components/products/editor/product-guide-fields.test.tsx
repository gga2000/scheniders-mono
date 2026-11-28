// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ProductEditorFormData } from "@/hooks/use-product-editor";
import { ProductBasicSection } from "./product-basic-section";
import { ProductPricingSection } from "./product-pricing-section";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, language: "en" }) }));
vi.mock("@/hooks/use-tenant", () => ({ useBusinessTypes: () => [] }));
vi.mock("./rich-text-editor", () => ({ RichTextEditor: () => null }));

afterEach(cleanup);

const form = {
    name: "",
    short_name: "",
    sku: "",
    description: "",
    short_description: "",
    price: 0,
    compare_at_price: 0,
    cost: 0,
    is_supply: false,
} as ProductEditorFormData;

/** The setup guide's light holds the one field it asks for, not the box around it (Ali, 28 Nov). */
const lit = (container: HTMLElement, id: string): Element => {
    const el = container.querySelector(`[data-guide="${id}"]`);
    if (!el) throw new Error(`no [data-guide="${id}"]`);
    return el;
};

describe("first product walk: the light sits on one field", () => {
    it("name: the name input only", () => {
        const { container } = render(<ProductBasicSection formData={form} updateField={vi.fn()} />);
        const el = lit(container, "product-name");
        expect(el.querySelector("#product-name")).toBeTruthy();
        expect(el.querySelector("#product-short-name")).toBeNull();
        expect(el.querySelector("#product-sku")).toBeNull();
    });

    it("price: the selling price only", () => {
        const { container } = render(
            <ProductPricingSection formData={form} updateField={vi.fn()} profitMargin={null} profitAmount={null} discountPercentage={null} />,
        );
        const el = lit(container, "product-price");
        expect(el.querySelector("#product-price")).toBeTruthy();
        expect(el.querySelector("#product-compare-at")).toBeNull();
        expect(el.querySelector("#product-cost")).toBeNull();
    });
});
