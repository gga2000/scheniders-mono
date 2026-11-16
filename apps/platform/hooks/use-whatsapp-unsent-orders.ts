"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { useOrdersListSettledOnce } from "@/hooks/orders-list-coverage";
import { supabase } from "@/lib/supabase";
import { WHATSAPP_UNSENT_REASONS, WHATSAPP_UNSENT_STATUSES, whatsappUnsentSince } from "@/lib/orders/whatsapp-unsent";

const EMPTY: readonly string[] = [];

async function fetchWhatsAppUnsent(tenantId: string): Promise<readonly string[]> {
    const { data, error } = await supabase
        .from("orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("needs_attention", true)
        .overlaps("attention_reasons", [...WHATSAPP_UNSENT_REASONS])
        .in("status", [...WHATSAPP_UNSENT_STATUSES])
        .is("deleted_at", null)
        .eq("is_archived", false)
        .gte("created_at", whatsappUnsentSince())
        .returns<{ id: string }[]>();
    if (error) throw error;
    return (data ?? []).map((o) => o.id);
}

/**
 * Orders of the last 30 days still waiting for the customer whose automatic
 * WhatsApp did not go out (Fermi B2), across all dates (the list loads only
 * today by default). Keyed under `orderKeys.lists()` so a status change
 * refreshes it.
 */
export function useWhatsAppUnsentOrders(): readonly string[] {
    const { session, clientReady, tenantId } = useAuth();
    // Not needed for the first card: waits for the list (see useOrdersListSettledOnce).
    const listSettled = useOrdersListSettledOnce();
    const { data } = useQuery({
        queryKey: [...orderKeys.lists(), "whatsapp-unsent", tenantId],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchWhatsAppUnsent(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId && listSettled,
        staleTime: 60_000,
    });
    return data ?? EMPTY;
}
