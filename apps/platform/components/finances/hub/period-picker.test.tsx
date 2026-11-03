import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PeriodPicker } from "./period-picker";
import type { FinancePeriod } from "@/hooks/use-finance-period";

const period: FinancePeriod = {
    preset: "custom",
    start: new Date("2026-10-03T09:00:00Z"),
    end: new Date("2026-10-10T09:00:00Z"),
    compareMode: "previous",
} as FinancePeriod;

describe("PeriodPicker custom range", () => {
    it("spells the typed dates with the month name so the browser's MM/DD box is not the only cue", () => {
        localStorage.setItem("schneiders_language", "en");
        render(
            <LanguageProvider>
                <PeriodPicker period={period} onApplyPreset={vi.fn()} onApplyCustom={vi.fn()} onChangeCompareMode={vi.fn()} />
            </LanguageProvider>,
        );
        fireEvent.click(screen.getByRole("button"));
        expect(screen.getByText(/October 3, 2026.*October 10, 2026/)).toBeTruthy();
    });
});
