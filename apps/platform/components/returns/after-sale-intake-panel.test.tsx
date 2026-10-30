import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { AfterSaleIntakePanel } from "./after-sale-intake-panel";

const mutate = vi.fn();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000 - 60_000).toISOString();

vi.mock("@/hooks/use-status-label", () => ({ useStatusLabel: () => (s: string) => s }));
vi.mock("@/hooks/use-after-sale-intake", () => ({
    useAfterSaleIntake: () => ({
        isLoading: false,
        error: null,
        data: {
            overdueDays: 10,
            items: [
                { id: "late", name: "Old perfume", qty: 1, amount: 15000, created_at: daysAgo(12),
                  child: { id: "c1", order_id: "RPL-3951-1", status: "delivered", customer_name: "Zaid", is_return: false } },
                { id: "fresh", name: "Body mist", qty: 2, amount: 9000, created_at: daysAgo(2),
                  child: { id: "c2", order_id: "RTN-3960-1", status: "in_transit", customer_name: "Noor", is_return: true } },
            ],
        },
    }),
    useReceiveAfterSaleItem: () => ({ mutate }),
}));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });
afterEach(() => { cleanup(); mutate.mockReset(); });

describe("AfterSaleIntakePanel", () => {
    it("puts items past the overdue limit in their own group", () => {
        render(<AfterSaleIntakePanel />);
        const overdue = screen.getByRole("heading", { name: /overdue|متأخرة/i }).nextElementSibling as HTMLElement;
        expect(within(overdue).getByText(/Old perfume/)).toBeTruthy();
        expect(within(overdue).queryByText(/Body mist/)).toBeNull();
    });

    it("records the condition picked for an item", () => {
        render(<AfterSaleIntakePanel />);
        const row = screen.getByText(/Body mist/).closest("li") as HTMLElement;
        fireEvent.click(within(row).getByRole("button", { name: /damaged|تالف/i }));
        expect(mutate).toHaveBeenCalledWith({ itemId: "fresh", condition: "damaged" }, expect.anything());
    });

    it("opens the replacement or refund order from its number", () => {
        const onOpenOrder = vi.fn();
        render(<AfterSaleIntakePanel onOpenOrder={onOpenOrder} />);
        fireEvent.click(screen.getByRole("button", { name: /RPL-3951-1/ }));
        expect(onOpenOrder).toHaveBeenCalledWith("c1");
    });
});
