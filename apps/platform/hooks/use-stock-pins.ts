"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { isAdminRole } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { MAX_STOCK_PINS, movePin, parseStockPins, resolveStockPins, STOCK_PINS_KEY, togglePin } from "@/lib/orders/stock-pins";
import type { StockTodayItem } from "@/lib/orders/stock-today";

/**
 * The store's pinned products for Stock today: one list per store in
 * `app_settings`, readable by the whole team and writable by store admins
 * (the table's own RLS). Re-read every minute so a change by one admin reaches
 * the rest of the team without a reload.
 */
export function useStockPins(items: readonly StockTodayItem[]) {
    const queryClient = useQueryClient();
    const { t } = useLanguage();
    const { session, clientReady, tenantId, role } = useAuth();
    const queryKey = useMemo(() => ["stock-pins", tenantId] as const, [tenantId]);

    const { data: saved, isSuccess } = useQuery({
        queryKey,
        queryFn: async () => {
            if (!tenantId) return null;
            const { data, error } = await supabase
                .from("app_settings")
                .select("value")
                .eq("tenant_id", tenantId)
                .eq("key", STOCK_PINS_KEY)
                .maybeSingle();
            if (error) throw error;
            return parseStockPins(data?.value);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 60_000,
    });

    const save = useMutation({
        mutationFn: async (keys: string[]) => {
            if (!tenantId) throw new Error("No tenant context");
            const { error } = await supabase.from("app_settings").upsert({
                key: STOCK_PINS_KEY,
                tenant_id: tenantId,
                value: { keys },
                updated_at: new Date().toISOString(),
            });
            if (error) throw error;
        },
        onMutate: async keys => {
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData<string[] | null>(queryKey);
            queryClient.setQueryData<string[] | null>(queryKey, keys);
            return { previous };
        },
        onError: (_error, _keys, context) => {
            queryClient.setQueryData<string[] | null>(queryKey, context?.previous ?? null);
            toast({
                title: t("orders.stockToday.pin.saveFailed", "Could not save the pinned products"),
                variant: "error",
            });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey }),
    });

    // Until the saved list is read, show nothing rather than a default that flips.
    const pinned = useMemo(
        () => (isSuccess ? resolveStockPins(items, saved ?? null) : []),
        [isSuccess, items, saved]
    );
    const keys = useMemo(() => pinned.map(p => p.key), [pinned]);

    const toggle = useCallback((key: string) => save.mutate(togglePin(keys, key)), [save, keys]);
    const move = useCallback((key: string, step: -1 | 1) => save.mutate(movePin(keys, key, step)), [save, keys]);

    return {
        pinned,
        canEdit: isAdminRole(role),
        isFull: keys.length >= MAX_STOCK_PINS,
        toggle,
        move,
    };
}
