"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import type { Order } from "@/types/order";

const EMPTY: Order[] = [];

/**
 * A customer's live orders across every date, for the duplicate compare modal.
 *
 * The modal used to compare only against the loaded rows, which since the
 * fetch is windowed are the active date range: the "2 طلبات" chip (counted on
 * the server) opened a modal with nothing to compare. Keyed under
 * `orderKeys.lists()` so a merge or status change from the modal, which
 * invalidates or patches that prefix, refreshes these rows too.
 */
export function useCustomerOrderHistory(phone: string | null | undefined): Order[] {
    const { session, clientReady, tenantId } = useAuth();
    const normalized = normalizePhoneForSearch(phone);

    const { data } = useQuery({
        queryKey: [...orderKeys.lists(), "customer-history", tenantId, normalized],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return orderRepository.findCustomerOrders(tenantId, normalized);
        },
        enabled: normalized !== "" && !!session && clientReady && !!tenantId,
        staleTime: 30_000,
    });

    return data ?? EMPTY;
}
