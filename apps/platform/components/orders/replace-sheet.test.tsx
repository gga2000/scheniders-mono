import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { refundableLines } from "@/lib/refunds/refund-math";
import type { OrderItem } from "@/types/order";
import { ReplaceSheet } from "./replace-sheet";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
// The real picker loads the catalogue; this one offers a single product.
vi.mock("./product-picker", () => ({
    ProductPicker: ({ open, onSelect, onClose }: { open: boolean; onSelect: (p: { product_id: string; name: string; price: number; quantity: number }) => void; onClose: () => void }) =>
        open ? (
            <button type="button" onClick={() => { onSelect({ product_id: "p-new", name: "New perfume", price: 20000, quantity: 1 }); onClose(); }}>
                pick-new
            </button>
        ) : null,
}));

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });
afterEach(cleanup);

const item = (name: string, price: number, quantity: number): OrderItem =>
    ({ product_id: name, name, price, quantity }) as OrderItem;

describe("ReplaceSheet", () => {
    it("sends the old line, the new item and the fee choice, with a live courier total", async () => {
        const onSubmit = vi.fn(async () => ({ success: true }));
        render(
            <ReplaceSheet
                open
                onClose={() => {}}
                orderNumber="3951"
                lines={refundableLines([item("Old perfume", 15000, 1)], 15000, [])}
                defaultFee={5000}
                onSubmit={onSubmit}
            />,
        );
        const createButton = () => screen.getByRole("button", { name: /create replacement|إنشاء الاستبدال/i }) as HTMLButtonElement;
        expect(createButton().disabled).toBe(true);

        fireEvent.click(screen.getByText(/add the new item|أضف المنتج الجديد/i));
        fireEvent.click(await screen.findByText("pick-new"));
        await waitFor(() => expect(screen.getByText("New perfume")).toBeTruthy());

        // 20,000 new − 15,000 credit + 5,000 fee
        expect(screen.getByTestId("replace-sheet").textContent).toMatch(/10,000/);
        expect(createButton().disabled).toBe(false);

        fireEvent.click(createButton());
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
            lines: [{ index: 0, quantity: 1 }],
            outItems: [{ productId: "p-new", name: "New perfume", price: 20000, quantity: 1 }],
            chargeFee: true,
            note: "",
        }));
    });

    it("shows a payout when the store absorbs the fee on a cheaper swap", async () => {
        render(
            <ReplaceSheet
                open
                onClose={() => {}}
                orderNumber="3951"
                lines={refundableLines([item("Old perfume", 30000, 1)], 30000, [])}
                defaultFee={5000}
                onSubmit={async () => ({ success: true })}
            />,
        );
        fireEvent.click(screen.getByText(/store pays|يدفعها المتجر/i));
        fireEvent.click(screen.getByText(/add the new item|أضف المنتج الجديد/i));
        fireEvent.click(await screen.findByText("pick-new"));
        const sheet = screen.getByTestId("replace-sheet");
        await waitFor(() => expect(sheet.textContent).toMatch(/courier pays the customer|يدفع المندوب للزبون/i));
        expect(sheet.textContent).toMatch(/10,000/);
    });
});
