// apps/platform/hooks/use-stock-shortfall-guard.ts
//
// Holds a confirm when the orders being confirmed need more of a product than
// is free to sell (on hand minus confirmed, or the open-box pile), and replays
// it only if the operator confirms anyway. A warning, not a block (Ali,
// 2026-10-30): stock may be arriving today, and a negative shelf count would
// otherwise freeze the product until it is recounted.

import { useMemo, useState } from "react";
import { findStockShortfalls, type StockShortfall } from "@/lib/orders/stock-shortfall";
import type { Order } from "@/types/order";
import type { Product } from "@/types/product";

export function useStockShortfallGuard(orders: Order[], products: Product[]) {
    const [open, setOpen] = useState(false);
    const [shortfalls, setShortfalls] = useState<StockShortfall[]>([]);
    const [pending, setPending] = useState<(() => void) | null>(null);

    const ordersById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);

    /**
     * Returns true when the confirm was held for the dialog — the caller must
     * then do nothing, because `proceed` runs only on "Confirm anyway".
     */
    const holdConfirm = (orderIds: string[], proceed: () => void): boolean => {
        const picked = orderIds.map(id => ordersById.get(id)).filter((o): o is Order => !!o);
        const found = findStockShortfalls(picked, products);
        if (found.length === 0) return false;
        setShortfalls(found);
        setPending(() => proceed);
        setOpen(true);
        return true;
    };

    /** `holdConfirm` for a single status change; anything but a confirm passes straight through. */
    const holdStatusChange = (orderId: string, status: Order["status"], proceed: () => void): boolean =>
        status === "confirmed" && holdConfirm([orderId], proceed);

    const dialogProps = {
        open,
        onOpenChange: (next: boolean) => {
            setOpen(next);
            if (!next) setPending(null);
        },
        shortfalls,
        // Runs the value captured at render: the dialog closes (clearing
        // `pending`) in the same click that calls this.
        onConfirmAnyway: () => pending?.(),
    };

    return { holdConfirm, holdStatusChange, dialogProps };
}
