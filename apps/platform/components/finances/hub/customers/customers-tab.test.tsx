/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render as rtlRender, screen, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/lib/supabase";
import { CustomersFinanceTab } from "./customers-tab";

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });
afterEach(cleanup);

const period = {
    start: new Date("2026-09-30T21:00:00.000Z"),
    end: new Date("2026-10-31T20:59:59.999Z"),
} as Parameters<typeof CustomersFinanceTab>[0]["period"];

const order = (id: string, phone: string, name: string, price: number): Order =>
    ({
        id, order_id: id, phone, customer_name: name, status: "delivered", price, items: [], is_return: false,
        created_at: "2026-10-10T10:00:00.000Z", updated_at: "2026-10-12T10:00:00.000Z",
    }) as unknown as Order;

describe("CustomersFinanceTab", () => {
    it("reads in Arabic and lists the top spender", () => {
        render(
            <CustomersFinanceTab
                orders={[order("a", "0750", "Ahmed", 90000), order("b", "0771", "Sara", 10000)]}
                period={period}
                compareRange={null}
                granularity="week"
            />,
        );
        expect(screen.getByText("الزبائن النشطون")).toBeTruthy();
        expect(screen.getByText("Ahmed")).toBeTruthy();
        expect(screen.queryByText("Active customers")).toBeNull();
    });

    it("renders with no orders", () => {
        render(<CustomersFinanceTab orders={[]} period={period} compareRange={null} granularity="week" />);
        expect(screen.getByText("الزبائن النشطون")).toBeTruthy();
    });
});
