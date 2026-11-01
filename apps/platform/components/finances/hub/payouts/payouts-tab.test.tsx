/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render as rtlRender, screen, cleanup, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { WaseetInvoice } from "@/types/waseet";
import type { Order } from "@/types/order";

const state = vi.hoisted(() => ({
    invoices: null as unknown,
    orders: [] as unknown[],
}));

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/hooks/use-waseet", () => {
    const fetchInvoices = async () => state.invoices;
    return { useWaseet: () => ({ fetchInvoices }) };
});
vi.mock("@/components/providers/orders-provider", () => ({
    useOrdersContext: () => ({ orders: state.orders }),
}));

import { PayoutsTab } from "./payouts-tab";

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });

afterEach(() => {
    cleanup();
    state.invoices = null;
    state.orders = [];
});

const invoice = (over: Partial<WaseetInvoice> & { id: string }): WaseetInvoice =>
    ({ status: "pending", merchant_price: "100000", delivered_orders_count: "4", updated_at: "2026-10-20T10:00:00Z", ...over }) as WaseetInvoice;

describe("PayoutsTab", () => {
    it("says so in Arabic when the courier cannot be reached", async () => {
        state.invoices = null;
        render(<PayoutsTab />);
        await waitFor(() => expect(screen.getByText(/تعذّر الوصول إلى الوسيط/)).toBeTruthy());
    });

    it("matches an invoice to the orders linked to it and flags a difference", async () => {
        state.invoices = [invoice({ id: "11", merchant_price: "100000" }), invoice({ id: "12", merchant_price: "150000" })];
        state.orders = [
            { id: "a", price: 100000, waseet_invoice_id: "11" },
            { id: "b", price: 100000, waseet_invoice_id: "12" },
        ] as unknown as Order[];
        render(<PayoutsTab />);
        await waitFor(() => expect(screen.getByText("مطابقة")).toBeTruthy());
        expect(screen.getByText("فرق")).toBeTruthy();
        expect(screen.getByText("فاتورة واحدة تحتاج مطابقة")).toBeTruthy();
    });
});
