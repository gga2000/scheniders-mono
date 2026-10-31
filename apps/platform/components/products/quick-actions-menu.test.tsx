// @vitest-environment jsdom
// "Change price…" must open its popover only after the menu has closed:
// opened while the menu is up, the menu's focus trap keeps the price field
// from ever getting focus.

import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { Product } from "@/lib/supabase";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => true }) }));

import { QuickActionsMenu } from "./quick-actions-menu";

const product = { id: "p1", name: "Oud", price: 25000, is_archived: false } as Product;

function Harness({ onChangePrice }: { onChangePrice: () => void }) {
    const [open, setOpen] = useState(true);
    return (
        <QuickActionsMenu
            product={product}
            onEdit={vi.fn()}
            onArchive={vi.fn()}
            onViewDetails={vi.fn()}
            onChangePrice={onChangePrice}
            open={open}
            onOpenChange={setOpen}
        />
    );
}

afterEach(cleanup);

describe("QuickActionsMenu price action", () => {
    it("opens the price popover once the menu has closed, not while it is open", async () => {
        const onChangePrice = vi.fn(() => {
            // The menu must already be gone when the popover is asked to open.
            expect(screen.queryByRole("menu")).toBeNull();
        });
        render(<Harness onChangePrice={onChangePrice} />);

        await act(async () => {
            fireEvent.click(screen.getByText("products.actions.changePrice"));
        });

        // Radix hands focus back on a timer after the menu unmounts.
        await waitFor(() => expect(onChangePrice).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole("menu")).toBeNull();
    });
});
