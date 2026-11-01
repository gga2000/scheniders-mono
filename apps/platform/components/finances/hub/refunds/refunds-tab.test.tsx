/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render as rtlRender, screen, cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/lib/supabase";
import { RefundsTab } from "./refunds-tab";

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });
afterEach(cleanup);

const period = { start: new Date("2026-09-30T21:00:00.000Z"), end: new Date("2026-10-31T20:59:59.999Z") };

const refund = (id: string, over: Partial<Order> = {}): Order =>
    ({
        id, order_id: id, status: "refund_delivered", is_return: true, price: -10000, phone: "0750",
        items: [{ name: "Shirt", quantity: 2, price: 5000 }],
        created_at: "2026-10-05T10:00:00.000Z", updated_at: "2026-10-10T10:00:00.000Z", ...over,
    }) as unknown as Order;

describe("RefundsTab", () => {
    it("words reasons and product rows in Arabic, including the unspecified reason", () => {
        render(<RefundsTab orders={[refund("r1"), refund("r2", { rejection_reason: "تالف" })]} period={period} compareRange={null} />);
        expect(screen.getByText("غير محدد")).toBeTruthy();
        expect(screen.getByText("تالف")).toBeTruthy();
        expect(screen.getAllByText(/مرتجع واحد/).length).toBeGreaterThan(0);
        expect(screen.getByText(/4 قطعة · 2 طلب/)).toBeTruthy();
        expect(screen.queryByText("Unspecified")).toBeNull();
    });

    it("shows the empty state without refunds", () => {
        render(<RefundsTab orders={[]} period={period} compareRange={null} />);
        expect(screen.getAllByText("لا استرجاعات في هذه الفترة.").length).toBeGreaterThan(0);
    });
});
