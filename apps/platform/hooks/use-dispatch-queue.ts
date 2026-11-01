"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderRepository } from "@/lib/repositories/order-repository";
import type { Order } from "@/lib/supabase";

export const DISPATCH_QUEUE_KEY = ["dispatch-queue"] as const;

/**
 * Every confirmed order of the store, oldest first: what is waiting for a label
 * and a courier. Read on its own because the /orders book is a date window and
 * a confirmed order from an earlier day still has to ship.
 */
export function useDispatchQueue() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: [...DISPATCH_QUEUE_KEY, tenantId],
        enabled: Boolean(tenantId),
        queryFn: (): Promise<Order[]> => (tenantId ? orderRepository.findConfirmed(tenantId) : Promise.resolve([])),
    });
}
