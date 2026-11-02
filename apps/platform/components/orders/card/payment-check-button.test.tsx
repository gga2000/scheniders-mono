import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PaymentCheckButton } from "./payment-check-button";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (k: string) => k, language: "en" }),
}));
vi.mock("@/hooks/chat/use-tenant-members", () => ({
    useTenantMembers: () => ({ data: [{ user_id: "u1", display_name: "Noor" }] }),
}));

const base = { id: "o1", status: "completed" as const, is_reviewed: false, reviewed_at: null, reviewed_by: null };

describe("PaymentCheckButton", () => {
    it("offers the check on delivered and completed orders only", () => {
        const { rerender } = render(<PaymentCheckButton order={base} onToggle={() => {}} />);
        expect(screen.getByRole("button", { pressed: false }).textContent).toBe("orders.payment.check");
        rerender(<PaymentCheckButton order={{ ...base, status: "in_transit" }} onToggle={() => {}} />);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("says who checked it and when, and toggles", () => {
        const onToggle = vi.fn();
        render(<PaymentCheckButton order={{ ...base, is_reviewed: true, reviewed_by: "u1", reviewed_at: "2026-11-02T03:00:00Z" }} onToggle={onToggle} />);
        const btn = screen.getByRole("button", { pressed: true });
        expect(btn.textContent).toBe("orders.payment.checked");
        expect(btn.getAttribute("title")).toContain("Noor");
        expect(btn.getAttribute("title")).toContain("2 Nov");
        fireEvent.click(btn);
        expect(onToggle).toHaveBeenCalledWith("o1");
    });
});
