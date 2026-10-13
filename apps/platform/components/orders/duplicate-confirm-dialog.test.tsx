import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import type { Order } from "@/types/order";
import { LanguageProvider } from "@/components/providers/language-provider";
import { DuplicateConfirmDialog } from "./duplicate-confirm-dialog";

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });

afterEach(cleanup);

const order = (overrides: Partial<Order> & { id: string }): Order => ({
    order_id: overrides.id,
    created_at: "2026-10-04T09:00:00.000Z",
    customer_name: "علي",
    phone: "07802301677",
    items: [{ name: "عطر فولاريس", quantity: 1, price: 43000 }],
    price: 43000,
    status: "new",
    priority: "normal",
    payment_status: "cod",
    is_return: false,
    is_replacement: false,
    is_archived: false,
    ...overrides,
});

/**
 * Mirrors how the orders page drives the dialog: the held confirm sits in state,
 * and closing the dialog clears it. "Confirm anyway" closes the dialog and runs
 * the held confirm in the same click — so it has to run from the value captured
 * at render, not from state that the close has just cleared.
 */
function Harness({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(true);
    const [pending, setPending] = useState<(() => void) | null>(() => onConfirm);
    return (
        <DuplicateConfirmDialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setPending(null);
            }}
            pairs={[{
                order: order({ id: "3261004002", status: "contacted" }),
                twin: order({ id: "3261004001", status: "confirmed" }),
            }]}
            onConfirmAnyway={() => pending?.()}
        />
    );
}

describe("DuplicateConfirmDialog", () => {
    it("runs the held confirm when the operator proceeds anyway", () => {
        const onConfirm = vi.fn();
        render(<Harness onConfirm={onConfirm} />);

        fireEvent.click(screen.getByText("تأكيد على أي حال"));

        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("drops the confirm when the operator backs out", () => {
        const onConfirm = vi.fn();
        render(<Harness onConfirm={onConfirm} />);

        fireEvent.click(screen.getByText("إلغاء"));

        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("names both orders so the operator can see what they would be duplicating", () => {
        render(<Harness onConfirm={vi.fn()} />);

        expect(screen.getByText("هذا الزبون لديه طلب مؤكد بالفعل")).toBeTruthy();
        expect(screen.getByText("#3261004001")).toBeTruthy();
        expect(screen.getByText("#3261004002")).toBeTruthy();
    });

    it("summarises a bulk selection instead of comparing one pair", () => {
        const pairs = ["a", "b", "c"].map(id => ({
            order: order({ id: `${id}-new`, status: "contacted" }),
            twin: order({ id: `${id}-old`, status: "confirmed" }),
        }));
        render(
            <DuplicateConfirmDialog open onOpenChange={() => {}} pairs={pairs} onConfirmAnyway={() => {}} />,
        );

        expect(screen.getByText("3 طلبات لها توأم مؤكد")).toBeTruthy();
    });

    it("speaks about shipping, not confirming, when it held a dispatch", () => {
        const onConfirm = vi.fn();
        render(
            <DuplicateConfirmDialog
                open
                onOpenChange={() => {}}
                action="dispatch"
                pairs={[{
                    order: order({ id: "3261004002", status: "confirmed" }),
                    twin: order({ id: "3261004001", status: "in_transit" }),
                }]}
                onConfirmAnyway={onConfirm}
            />,
        );

        expect(screen.getByText(/الشحن الآن يعني إرسال مندوب ثانٍ/)).toBeTruthy();
        expect(screen.queryByText("تأكيد على أي حال")).toBeNull();
        fireEvent.click(screen.getByText("شحن على أي حال"));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
