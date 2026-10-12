// apps/platform/hooks/use-duplicate-dispatch-guard.ts
//
// Holds a confirm or a move to In Transit when the order has a committed 48h
// twin (lib/duplicate-window), and replays it only if the operator chooses to
// go ahead anyway. Shared by the desktop orders page and the mobile list so
// both ask the same question with the same dialog.

import { useMemo, useState } from "react";
import {
    duplicateGuardFor,
    findDuplicateDispatchPairs,
    type DuplicateDispatchPair,
    type DuplicateGuardAction,
} from "@/lib/duplicate-window";
import type { Order } from "@/types/order";

export function useDuplicateDispatchGuard(
    orders: Order[],
    getCommittedTwin: (orderId: string) => Order | undefined,
) {
    const [open, setOpen] = useState(false);
    const [pairs, setPairs] = useState<DuplicateDispatchPair[]>([]);
    const [action, setAction] = useState<DuplicateGuardAction>("confirm");
    const [pending, setPending] = useState<(() => void) | null>(null);

    const ordersById = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);

    /**
     * Returns true when the action was held for the dialog — the caller must
     * then do nothing, because `proceed` runs only on "… anyway".
     */
    const hold = (orderIds: string[], guard: DuplicateGuardAction, proceed: () => void): boolean => {
        const found = findDuplicateDispatchPairs(orderIds, ordersById, getCommittedTwin);
        if (found.length === 0) return false;
        setPairs(found);
        setAction(guard);
        setPending(() => proceed);
        setOpen(true);
        return true;
    };

    /** `hold` for a single status change; statuses that cost nothing pass straight through. */
    const holdStatusChange = (orderId: string, status: Order["status"], proceed: () => void): boolean => {
        const guard = duplicateGuardFor(status);
        return guard !== null && hold([orderId], guard, proceed);
    };

    const dialogProps = {
        open,
        onOpenChange: (next: boolean) => {
            setOpen(next);
            if (!next) setPending(null);
        },
        pairs,
        action,
        // Runs the value captured at render: the dialog closes (clearing
        // `pending`) in the same click that calls this.
        onConfirmAnyway: () => pending?.(),
    };

    return { hold, holdStatusChange, dialogProps };
}
