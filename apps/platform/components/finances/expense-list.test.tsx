/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { EXPENSE_CATEGORIES, type Expense } from "@/types/expense";
import { ExpenseList } from "./expense-list";

// Real provider: Arabic is the default merchants run in, so these read the real dictionary.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });

afterEach(cleanup);

const expense = (over: Partial<Expense> & { id: string }): Expense => ({
    created_at: "2026-10-10T09:00:00.000Z",
    expense_date: "2026-10-10",
    category: "shipping",
    amount: 5000,
    is_recurring: false,
    ...over,
});

describe("ExpenseList", () => {
    it("shows every category filter in Arabic", () => {
        render(<ExpenseList expenses={[expense({ id: "a" })]} onEdit={() => {}} onDelete={() => {}} />);
        expect(screen.getByRole("button", { name: "الكل" })).toBeTruthy();
        for (const name of ["الشحن", "التسويق", "التغليف", "تكلفة المنتج", "أخرى"]) {
            expect(screen.getAllByText(name).length).toBeGreaterThan(0);
        }
        expect(EXPENSE_CATEGORIES).toHaveLength(9);
    });

    it("filters by category and shows the Arabic empty state when nothing matches", () => {
        render(<ExpenseList expenses={[expense({ id: "a" })]} onEdit={() => {}} onDelete={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "التسويق" }));
        expect(screen.getByText("لا توجد مصروفات")).toBeTruthy();
    });

    it("keeps the stored day under UTC formatting so the date header never shifts", () => {
        render(<ExpenseList expenses={[expense({ id: "a", expense_date: "2026-10-01" })]} onEdit={() => {}} onDelete={() => {}} />);
        // 2026-10-01 is a Thursday; a local-time parse west of UTC would say Wednesday.
        expect(screen.getByText(/الخميس/)).toBeTruthy();
    });

    it("marks integration rows Auto and takes away their edit and delete menu", () => {
        render(
            <ExpenseList
                expenses={[
                    expense({ id: "auto", category: "marketing", amount: 90000, source: "meta_ads" }),
                    expense({ id: "hand", category: "shipping", amount: 5000 }),
                ]}
                onEdit={() => {}}
                onDelete={() => {}}
            />,
        );
        expect(screen.getAllByText("تلقائي")).toHaveLength(1);
        // One actions button, for the hand-typed row only.
        expect(document.querySelectorAll("button.p-2")).toHaveLength(1);
    });
});
