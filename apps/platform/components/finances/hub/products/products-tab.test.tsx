/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render as rtlRender, screen, cleanup, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order, Product } from "@/lib/supabase";
import { ProductsFinanceTab } from "./products-tab";

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

// Real provider: Arabic is the default language merchants run in.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });

afterEach(cleanup);

const period = {
    start: new Date("2026-09-30T21:00:00.000Z"), // 1 Oct 00:00 Baghdad
    end: new Date("2026-10-31T20:59:59.999Z"),
} as Parameters<typeof ProductsFinanceTab>[0]["period"];

const products = [{ id: "p1", name: "Shirt", sku: "SH-1", cost: 4000 }] as Product[];

const order = (over: Partial<Order> & { id: string }): Order =>
    ({
        order_id: over.id,
        status: "delivered",
        is_return: false,
        price: 10000,
        created_at: "2026-10-10T09:00:00.000Z",
        updated_at: "2026-10-10T09:00:00.000Z",
        items: [{ name: "Shirt", sku: "SH-1", product_id: "p1", quantity: 1, price: 10000 }],
        ...over,
    }) as Order;

describe("ProductsFinanceTab", () => {
    it("reads in Arabic and counts only delivered sales as units and revenue", () => {
        render(
            <ProductsFinanceTab
                products={products}
                period={period}
                orders={[
                    order({ id: "a" }),
                    order({ id: "b", status: "cancelled" }),
                    // A refund row must not add units or revenue.
                    order({ id: "c", status: "refund_delivered", is_return: true, price: -10000 }),
                ]}
            />,
        );
        expect(screen.getByText("اقتصاديات كل منتج")).toBeTruthy();
        expect(screen.getByText("منتج واحد مباع")).toBeTruthy();
        const row = screen.getByText("SH-1").closest("tr");
        expect(row).not.toBeNull();
        const cells = within(row as HTMLElement).getAllByRole("cell");
        expect(cells[2].textContent).toBe("1"); // units
        // The month-long window buckets by week; the heatmap headers follow the language.
        expect(screen.getAllByText(/^أسبوع /).length).toBeGreaterThan(0);
        expect(screen.queryByText(/^Wk /)).toBeNull();
    });

    it("shows the Arabic empty state when nothing sold", () => {
        render(<ProductsFinanceTab products={products} period={period} orders={[]} />);
        expect(screen.getByText("لا نشاط للمنتجات في هذه الفترة.")).toBeTruthy();
    });
});
