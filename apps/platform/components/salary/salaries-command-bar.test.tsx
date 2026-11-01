import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { SalariesCommandBar } from "./salaries-command-bar";
import type { PeriodMode } from "@/hooks/use-salaries";

afterEach(cleanup);

function renderBar(periodMode: PeriodMode, payableCount: number, onPayAll = vi.fn()) {
    localStorage.setItem("schneiders_language", "en");
    render(
        <LanguageProvider>
            <SalariesCommandBar
                periodMode={periodMode}
                onPeriodModeChange={() => undefined}
                customStart="2026-10-01"
                customEnd="2026-10-31"
                onCustomStartChange={() => undefined}
                onCustomEndChange={() => undefined}
                attributionMode="all"
                onAttributionModeChange={() => undefined}
                onRefresh={() => undefined}
                onOpenRoleDefaults={() => undefined}
                payableCount={payableCount}
                onPayAll={onPayAll}
            />
        </LanguageProvider>,
    );
    return onPayAll;
}

describe("SalariesCommandBar", () => {
    it("explains 'since last payment' instead of showing one shared date range", () => {
        renderBar("since_last", 2);
        expect(screen.getByText(/from the day after their last payment/)).toBeTruthy();
        expect(screen.queryByLabelText("From")).toBeNull();
    });

    it("shows the two dates in custom mode", () => {
        renderBar("custom", 2);
        expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-10-01");
        expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-10-31");
    });

    it("shows how many members Pay all covers and turns it off when nobody is owed", () => {
        const onPayAll = renderBar("since_last", 3);
        const button = screen.getByRole("button", { name: /Pay all/ });
        expect(button.textContent).toContain("3");
        fireEvent.click(button);
        expect(onPayAll).toHaveBeenCalledOnce();
        cleanup();
        renderBar("since_last", 0);
        expect((screen.getByRole("button", { name: /Pay all/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("names its icon buttons", () => {
        renderBar("since_last", 1);
        expect(screen.getByRole("button", { name: "Role defaults" })).toBeTruthy();
    });
});
