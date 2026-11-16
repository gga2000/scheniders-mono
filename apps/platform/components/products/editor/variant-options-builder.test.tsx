/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "ar" }),
}));

const state: { types: string[] } = { types: [] };
vi.mock("@/hooks/use-tenant", () => ({ useBusinessTypes: () => state.types }));

import { VariantOptionsBuilder, type ProductOptionFormData } from "./variant-options-builder";

afterEach(() => {
    cleanup();
    state.types = [];
});

function renderBuilder(options: ProductOptionFormData[] = []) {
    const onChange = vi.fn();
    render(<VariantOptionsBuilder options={options} onChange={onChange} />);
    return onChange;
}

describe("VariantOptionsBuilder ready sizes and colours (B10)", () => {
    it("a clothing shop adds S to XXL in one click, as sizes with their own stock", () => {
        state.types = ["clothing"];
        const onChange = renderBuilder();
        const presets = screen.getByTestId("variant-presets");
        expect(within(presets).getByText("مقاس الحذاء")).toBeTruthy();
        fireEvent.click(within(presets).getByText("المقاس"));
        expect(onChange).toHaveBeenCalledWith([
            expect.objectContaining({ name: "المقاس", option_type: "size", values: ["S", "M", "L", "XL", "XXL"] }),
        ]);
    });

    it("colours carry their swatch", () => {
        state.types = ["clothing"];
        const onChange = renderBuilder();
        fireEvent.click(within(screen.getByTestId("variant-presets")).getByText("اللون"));
        const [added] = onChange.mock.calls[0][0] as ProductOptionFormData[];
        expect(added.values_metadata?.[0]).toEqual({ label: "أسود", hex: "#111111" });
    });

    it("a perfume shop is offered bottle sizes, not clothing sizes", () => {
        state.types = ["perfume"];
        renderBuilder();
        const presets = screen.getByTestId("variant-presets");
        expect(within(presets).getByText("الحجم")).toBeTruthy();
        expect(within(presets).queryByText("مقاس الحذاء")).toBeNull();
    });

    it("never offers a group the product already has", () => {
        state.types = ["clothing"];
        renderBuilder([{ name: "المقاس", values: ["S"], option_type: "size", values_metadata: [] }]);
        const presets = screen.getByTestId("variant-presets");
        expect(within(presets).queryByText("المقاس")).toBeNull();
        expect(within(presets).getByText("اللون")).toBeTruthy();
    });
});
