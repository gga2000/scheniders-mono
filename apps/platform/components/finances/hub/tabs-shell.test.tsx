import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { TabsShell, type FinanceTabId } from "./tabs-shell";

const ALL: FinanceTabId[] = [
    "overview", "revenue", "profit_analysis", "cash", "expenses", "payouts", "invoices",
    "refunds", "customers", "products", "print", "forecasts", "reports", "salaries",
];

function shell(active: FinanceTabId, onChange = vi.fn()) {
    localStorage.setItem("schneiders_language", "en");
    render(<LanguageProvider><TabsShell activeTab={active} onChange={onChange} /></LanguageProvider>);
    return onChange;
}

describe("TabsShell", () => {
    it("opens a group on its first tab", () => {
        const onChange = shell("overview");
        fireEvent.click(screen.getByRole("tab", { name: /^Cash$/ }));
        expect(onChange).toHaveBeenCalledWith("cash");
    });

    it("shows the sub-tabs of the active tab's group and switches between them", () => {
        const onChange = shell("payouts");
        for (const name of [/Cash & COD/, /Payouts/, /Invoices/]) expect(screen.getByRole("tab", { name })).toBeTruthy();
        expect(screen.queryByRole("tab", { name: /^Customers$/ })).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: /Invoices/ }));
        expect(onChange).toHaveBeenCalledWith("invoices");
    });

    it("gives every tab a home, so none is unreachable", () => {
        const reachable = new Set<FinanceTabId>();
        for (const tab of ALL) {
            const { unmount } = render(<LanguageProvider><TabsShell activeTab={tab} onChange={() => {}} /></LanguageProvider>);
            const active = screen.getAllByRole("tab").filter((el) => el.getAttribute("aria-selected") === "true");
            expect(active.length).toBeGreaterThan(0);
            reachable.add(tab);
            unmount();
        }
        expect(reachable.size).toBe(ALL.length);
    });
});
