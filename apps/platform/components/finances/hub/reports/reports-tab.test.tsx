/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render as rtlRender, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ReportsTab } from "./reports-tab";

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });
afterEach(cleanup);

const period = { start: new Date("2026-09-30T21:00:00.000Z"), end: new Date("2026-10-31T20:59:59.999Z") };

describe("ReportsTab", () => {
    it("runs the page's export and print, in Arabic", () => {
        const onExport = vi.fn();
        const onPrint = vi.fn();
        render(<ReportsTab period={period} onExport={onExport} onPrint={onPrint} />);
        fireEvent.click(screen.getByRole("button", { name: /التقرير المالي \(CSV\)/ }));
        fireEvent.click(screen.getByRole("button", { name: /طباعة التقرير المالي/ }));
        expect(onExport).toHaveBeenCalledTimes(1);
        expect(onPrint).toHaveBeenCalledTimes(1);
    });

    it("disables both while the order book is still loading", () => {
        render(<ReportsTab period={period} />);
        const buttons = screen.getAllByRole("button");
        expect(buttons.length).toBe(2);
        expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
        expect(screen.getAllByText("جارٍ تحميل الطلبات…")).toHaveLength(2);
    });
});
