import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ConfirmPayrollDialog } from "./confirm-payroll-dialog";
import { payrollEmployees } from "../../stories/payroll-fixtures";

afterEach(cleanup);

// محمد كريم: net 762,000 IQD in the fixtures.
const member = payrollEmployees[0];

function renderDialog(onConfirm = vi.fn()) {
    localStorage.setItem("schneiders_language", "en");
    render(
        <LanguageProvider>
            <ConfirmPayrollDialog isOpen data={member} onConfirm={onConfirm} onClose={() => undefined} />
        </LanguageProvider>,
    );
    return onConfirm;
}

describe("ConfirmPayrollDialog part-payment", () => {
    it("pays the full net by default", () => {
        const onConfirm = renderDialog();
        expect((screen.getByLabelText("Pay now") as HTMLInputElement).value).toBe("762,000");
        fireEvent.click(screen.getByRole("button", { name: /Confirm & lock/ }));
        expect(onConfirm).toHaveBeenCalledWith("", "cash", null);
    });

    it("pays part and shows what is still owed", () => {
        const onConfirm = renderDialog();
        fireEvent.change(screen.getByLabelText("Pay now"), { target: { value: "500,000" } });
        expect(screen.getByText(/Still owed: 262,000 IQD/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Pay part & lock/ }));
        expect(onConfirm).toHaveBeenCalledWith("", "cash", 500000);
    });

    it("blocks paying more than the net", () => {
        renderDialog();
        fireEvent.change(screen.getByLabelText("Pay now"), { target: { value: "900000" } });
        expect(screen.getByText(/More than the net payable/)).toBeTruthy();
        expect((screen.getByRole("button", { name: /Confirm & lock/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("goes back to the full amount", () => {
        const onConfirm = renderDialog();
        fireEvent.change(screen.getByLabelText("Pay now"), { target: { value: "100000" } });
        fireEvent.click(screen.getByRole("button", { name: "Full amount" }));
        fireEvent.click(screen.getByRole("button", { name: /Confirm & lock/ }));
        expect(onConfirm).toHaveBeenCalledWith("", "cash", null);
    });
});
