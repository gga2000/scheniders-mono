// apps/platform/hooks/use-duplicate-window-alerts.ts
//
// The 48h money-at-risk duplicate alerts for whatever the orders page is
// showing. See `lib/duplicate-window.ts` for what counts as a duplicate and
// why it is a separate, stricter question than the ±72h customer chips.

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { orderKeys, orderWindowKey } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import {
    buildDuplicateWindowIndex,
    committedTwinBlockingConfirm,
    duplicateCandidateWindow,
    type DuplicateWindowAlert,
} from "@/lib/duplicate-window";
import type { OrderWindow } from "@/lib/order-window";
import type { Order } from "@/lib/supabase";

/**
 * @param orders  the rows the page has loaded — fresh, realtime-patched
 * @param window  the date window those rows were fetched for; `null` = all
 */
export function useDuplicateWindowAlerts(
    orders: Order[],
    window: OrderWindow,
): {
    /** The alert to show on an order's card, if it has one. */
    getDuplicateWindowAlert: (orderId: string) => DuplicateWindowAlert | undefined;
    /** A twin already confirmed or further along — confirming this order would double-dispatch. */
    getConfirmBlockingTwin: (orderId: string) => Order | undefined;
} {
    const { session, clientReady } = useAuth();
    const candidateWindow = duplicateCandidateWindow(window);

    // Only a windowed view needs the margin; with the complete set loaded the
    // query never runs. Keyed under `orders` so the invalidation every order
    // mutation already performs refreshes it too.
    const { data: margin } = useQuery({
        queryKey: [...orderKeys.all, "duplicate-candidates", orderWindowKey(candidateWindow)],
        queryFn: () => orderRepository.findWindow(candidateWindow),
        enabled: candidateWindow !== null && !!session && clientReady,
        staleTime: 60_000,
    });

    const index = useMemo(() => {
        if (!margin) return buildDuplicateWindowIndex(orders);
        // The loaded rows win over the margin copy of the same order: realtime
        // patches them, so their status is the current one — and status is what
        // decides whether a pair is critical.
        const byId = new Map<string, Order>();
        for (const o of margin) byId.set(o.id, o);
        for (const o of orders) byId.set(o.id, o);
        return buildDuplicateWindowIndex([...byId.values()]);
    }, [orders, margin]);

    const getDuplicateWindowAlert = useCallback((orderId: string) => index.get(orderId), [index]);
    const getConfirmBlockingTwin = useCallback(
        (orderId: string) => committedTwinBlockingConfirm(orderId, index),
        [index],
    );
    return { getDuplicateWindowAlert, getConfirmBlockingTwin };
}
