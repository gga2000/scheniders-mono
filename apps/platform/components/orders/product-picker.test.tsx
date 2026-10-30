/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { Product } from "@/types/product";

// t() returns the key so assertions can target strings without coupling the
// test to Arabic or English copy.
vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "ar" }),
}));

const products: Product[] = [];
vi.mock("@/hooks/use-products-crud", () => ({
    useProductsCrud: () => ({ products, loading: false }),
}));

// Recent order lines feed the top-seller ordering; tests set them directly.
import type { RecentSaleLine } from "@/lib/product-recent-sales";
let recentLines: RecentSaleLine[] | undefined;
vi.mock("@/hooks/use-recent-order-lines", () => ({
    useRecentOrderLines: () => ({ data: recentLines }),
}));

import { Dialog, DialogContent, DialogTitle } from "@scheniders/ui/dialog";
import { ProductPicker } from "./product-picker";

function makeProduct(over: Partial<Product> & { id: string; name: string }): Product {
    return {
        created_at: "2026-01-01T00:00:00Z",
        price: 10000,
        stock_quantity: 5,
        reserved_quantity: 0,
        open_box_quantity: 0,
        low_stock_threshold: 1,
        is_archived: false,
        is_supply: false,
        is_filler: false,
        status: "active",
        product_type: "physical",
        ...over,
    } as Product;
}

function setProducts(next: Product[]) {
    products.length = 0;
    products.push(...next);
}

const MAIN = makeProduct({ id: "m1", name: "انفوي بلو" });
const OTHER_MAIN = makeProduct({ id: "m2", name: "ويفر انتنس" });
const FILLER_A = makeProduct({ id: "f1", name: "تمر كراميل", is_filler: true });
const FILLER_B = makeProduct({ id: "f2", name: "عود ساتان", is_filler: true });

function renderPicker(onSelect = vi.fn()) {
    return { onSelect, ...render(<ProductPicker open onClose={vi.fn()} onSelect={onSelect} />) };
}

/** The collapsed group header, which also carries the filler count. */
const fillerToggle = () =>
    screen.getByText(/orders\.productPicker\.fillerGroup/).closest("button") as HTMLElement;

afterEach(() => {
    cleanup();
    setProducts([]);
    recentLines = undefined;
});

describe("ProductPicker filler grouping", () => {
    it("lists main stock and hides filler behind a collapsed group", () => {
        setProducts([MAIN, FILLER_A, FILLER_B]);
        renderPicker();

        expect(screen.getByText("انفوي بلو")).toBeDefined();
        expect(screen.queryByText("تمر كراميل")).toBeNull();
        expect(screen.queryByText("عود ساتان")).toBeNull();
    });

    it("names how many filler products are tucked away", () => {
        setProducts([MAIN, FILLER_A, FILLER_B]);
        renderPicker();

        expect(within(fillerToggle()).getByText(/\(2\)/)).toBeDefined();
    });

    it("counts filler in the header total even while collapsed", () => {
        setProducts([MAIN, FILLER_A, FILLER_B]);
        renderPicker();

        expect(screen.getByText(/^3 orders\.productPicker\.product/)).toBeDefined();
    });

    it("reveals filler when the group is opened, and hides it again", () => {
        setProducts([MAIN, FILLER_A]);
        renderPicker();

        fireEvent.click(fillerToggle());
        expect(screen.getByText("تمر كراميل")).toBeDefined();

        fireEvent.click(fillerToggle());
        expect(screen.queryByText("تمر كراميل")).toBeNull();
    });

    it("renders no group at all when nothing is filler", () => {
        setProducts([MAIN, OTHER_MAIN]);
        renderPicker();

        expect(screen.queryByText(/orders\.productPicker\.fillerGroup/)).toBeNull();
    });

    // The bug this guards: staff search a real product name, every match is
    // filler, and the picker shows an empty list with the answer hidden one
    // click away.
    it("opens the group automatically when only filler matches the search", () => {
        setProducts([MAIN, FILLER_A]);
        renderPicker();

        fireEvent.change(screen.getByPlaceholderText("orders.productPicker.search"), {
            target: { value: "تمر" },
        });

        expect(screen.getByText("تمر كراميل")).toBeDefined();
    });

    it("leaves the group collapsed while main stock still matches the search", () => {
        setProducts([makeProduct({ id: "m3", name: "كراميل مملح" }), FILLER_A]);
        renderPicker();

        fireEvent.change(screen.getByPlaceholderText("orders.productPicker.search"), {
            target: { value: "كراميل" },
        });

        expect(screen.getByText("كراميل مملح")).toBeDefined();
        expect(screen.queryByText("تمر كراميل")).toBeNull();
    });

    it("still shows the empty state when neither main nor filler matches", () => {
        setProducts([MAIN, FILLER_A]);
        renderPicker();

        fireEvent.change(screen.getByPlaceholderText("orders.productPicker.search"), {
            target: { value: "لا يوجد" },
        });

        expect(screen.getByText("orders.productPicker.noProducts")).toBeDefined();
    });

    it("a filler product can still be ordered — it is stock depth, not a block", () => {
        setProducts([MAIN, FILLER_A]);
        const { onSelect } = renderPicker();

        fireEvent.click(fillerToggle());
        fireEvent.click(screen.getByText("تمر كراميل"));
        fireEvent.click(screen.getByText(/orders\.productPicker\.add/));

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0]).toMatchObject({ product_id: "f1", quantity: 1 });
    });

    it("keeps supplies and archived products out of both lists", () => {
        setProducts([
            MAIN,
            makeProduct({ id: "s1", name: "علبة تغليف", is_supply: true, is_filler: true }),
            makeProduct({ id: "a1", name: "منتج مؤرشف", is_archived: true, is_filler: true }),
        ]);
        renderPicker();

        expect(screen.queryByText(/orders\.productPicker\.fillerGroup/)).toBeNull();
        expect(screen.getByText(/^1 orders\.productPicker\.product/)).toBeDefined();
    });
});

describe("ProductPicker top-seller ordering", () => {
    const A = makeProduct({ id: "a", name: "عطر ألف" });
    const B = makeProduct({ id: "b", name: "عطر باء" });
    const C = makeProduct({ id: "c", name: "عطر جيم" });
    const shownNames = () =>
        [A, B, C].map((p) => p.name).filter((n) => screen.queryByText(n))
            .sort((x, y) => {
                const ex = screen.getByText(x), ey = screen.getByText(y);
                return ex.compareDocumentPosition(ey) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
            });

    it("keeps catalogue order until recent sales load", () => {
        setProducts([A, B, C]);
        renderPicker();
        expect(shownNames()).toEqual([A.name, B.name, C.name]);
    });

    it("lists the last 30 days' top sellers first, then the rest", () => {
        setProducts([A, B, C]);
        recentLines = [
            { product_id: "c", quantity: 5 },
            { product_id: "b", quantity: 2 },
            { product_id: "c", quantity: 1 },
        ];
        renderPicker();
        expect(shownNames()).toEqual([C.name, B.name, A.name]);
    });

    it("search still filters the ranked list", () => {
        setProducts([A, B, C]);
        recentLines = [{ product_id: "c", quantity: 5 }];
        renderPicker();
        fireEvent.change(screen.getByRole("textbox"), { target: { value: "باء" } });
        expect(shownNames()).toEqual([B.name]);
    });
});

describe("ProductPicker over another dialog", () => {
    /** The pointer-events value an element really gets: its own, or the nearest ancestor's. */
    const effectivePointerEvents = (el: HTMLElement | null): string => {
        for (let node = el; node; node = node.parentElement) {
            if (node.style.pointerEvents) return node.style.pointerEvents;
        }
        return "auto";
    };

    it("takes clicks when opened over a modal dialog (Replace sheet, order details)", () => {
        setProducts([MAIN]);
        const screenWithPicker = (pickerOpen: boolean) => (
            <>
                <Dialog open>
                    <DialogContent>
                        <DialogTitle>order</DialogTitle>
                    </DialogContent>
                </Dialog>
                <ProductPicker open={pickerOpen} onClose={vi.fn()} onSelect={vi.fn()} />
            </>
        );
        // As in the app: the dialog underneath is already open when "add product" opens the picker.
        const { rerender } = render(screenWithPicker(false));
        rerender(screenWithPicker(true));

        expect(document.body.style.pointerEvents).toBe("none");
        const picker = screen.getByRole("dialog", { name: "orders.productPicker.title" });
        expect(effectivePointerEvents(within(picker).getByText("انفوي بلو"))).toBe("auto");
    });
});

describe("ProductPicker stock left", () => {
    it("shows new left after confirmed orders, and open-box left", () => {
        setProducts([makeProduct({ id: "s1", name: "انفوي", stock_quantity: 202, reserved_quantity: 17, open_box_quantity: 5 })]);
        renderPicker();

        expect(screen.getByText("جديد 185 متبقي")).toBeDefined();
        expect(screen.getByText(/مفتوحة 5/)).toBeDefined();
    });

    it("reads an oversold product as how many over, and skips filler", () => {
        setProducts([
            makeProduct({ id: "s2", name: "برسيفيرون", stock_quantity: -84, reserved_quantity: 10 }),
            makeProduct({ id: "s3", name: "مينيا", is_filler: true, stock_quantity: 1, reserved_quantity: 2 }),
        ]);
        renderPicker();

        expect(screen.getByText("جديد 94 زيادة")).toBeDefined();
        expect(screen.queryByText(/جديد 1 زيادة/)).toBeNull();
    });
});
