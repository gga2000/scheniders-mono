// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Product } from "@/lib/supabase";

vi.mock("@/hooks/use-products-query", () => ({ useProductDetails: () => ({ data: undefined }) }));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => false }) }));

import { ProductDetailModal } from "./product-detail-modal";

afterEach(cleanup);

const product = (stock: number, reserved: number) =>
    ({
        id: "p1",
        name: "عطر",
        price: 25000,
        cost: null,
        stock_quantity: stock,
        reserved_quantity: reserved,
        low_stock_threshold: 10,
        times_sold: 0,
        total_revenue: 0,
        average_order_value: 0,
        image_url: null,
        is_archived: false,
        variants: [],
    }) as unknown as Product;

const open = (p: Product) =>
    render(
        <LanguageProvider>
            <ProductDetailModal isOpen product={p} priceHistory={[]} onClose={() => {}} onEdit={() => {}} />
        </LanguageProvider>,
    ).container.textContent ?? "";

describe("product detail stock", () => {
    it("names an oversell with its count, not «متاح 0 قطعة» under a «مباع بالزيادة» chip", () => {
        localStorage.setItem("schneiders_language", "ar");
        const text = open(product(-55, 0));
        expect(text).toContain("مباع بالزيادة55 قطعة");
        expect(text).not.toContain("متاح0 قطعة");
    });

    it("shows what is free to sell when there is stock", () => {
        localStorage.setItem("schneiders_language", "ar");
        const text = open(product(53, 3));
        expect(text).toContain("متاح50 قطعة");
    });
});
