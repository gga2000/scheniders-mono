"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";

export interface AppSetting {
    key: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any;
    description?: string;
    updated_at?: string;
    updated_by?: string;
    tenant_id?: string;
}

// Default settings fallback
const DEFAULT_SETTINGS: Record<string, unknown> = {
    store_profile: { name: "My Store", currency: "IQD", timezone: "Asia/Baghdad" },
    delivery_fees: { default: 5000, baghdad: 5000, provinces: 8000, free_shipping_threshold: 0 },
    inventory_rules: { low_stock_threshold: 5, enable_stock_alerts: true },
    print_settings: { label_size: "4x6", show_price: true, show_phone: true, batch_grouping: "city" },
    auto_archive: { enabled: false, days: 60, archive_canceled: true, archive_delivered: true },
    quick_actions: { show_cancel: true, show_reject: true, show_whatsapp: true, show_print: true },
    notification_settings: { sound_enabled: true, sound_url: "/sounds/notification.mp3", toast_enabled: true },
};

export function useSettings() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();

    const queryKey = ["app-settings", tenantId];

    const { data: settings = DEFAULT_SETTINGS, isLoading: loading, error, refetch } = useQuery({
        queryKey,
        queryFn: async () => {
            // RLS filters by tenant automatically
            const { data, error: fetchError } = await supabase
                .from("app_settings")
                .select("*");

            if (fetchError) throw fetchError;

            const settingsMap: Record<string, unknown> = { ...DEFAULT_SETTINGS };
            if (data) {
                data.forEach((row: AppSetting) => {
                    settingsMap[row.key] = row.value;
                });
            }
            return settingsMap;
        },
        enabled: !!tenantId,
        staleTime: 1000 * 60 * 60,
    });

    const updateMutation = useMutation({
        mutationFn: async ({ key, newValue }: { key: string; newValue: unknown }) => {
            if (!tenantId) throw new Error("No tenant context");
            const { error: updateError } = await supabase
                .from("app_settings")
                .upsert({
                    key,
                    value: newValue,
                    tenant_id: tenantId,
                    updated_at: new Date().toISOString()
                });

            if (updateError) throw updateError;
            return { key, newValue };
        },
        onMutate: async ({ key, newValue }) => {
            await queryClient.cancelQueries({ queryKey });
            const previousSettings = queryClient.getQueryData<Record<string, unknown>>(queryKey);

            queryClient.setQueryData<Record<string, unknown>>(queryKey, (old) => ({
                ...(old || DEFAULT_SETTINGS),
                [key]: newValue,
            }));

            return { previousSettings };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousSettings) {
                queryClient.setQueryData(queryKey, context.previousSettings);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        }
    });

    const updateSetting = useCallback(async (key: string, newValue: unknown) => {
        try {
            await updateMutation.mutateAsync({ key, newValue });
            return { success: true };
        } catch (err) {
            console.error(`Error updating setting ${key}:`, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update setting"
            };
        }
    }, [updateMutation]);

    const get = useCallback((key: string) => {
        return (settings as Record<string, unknown>)[key] || DEFAULT_SETTINGS[key];
    }, [settings]);

    return {
        settings,
        loading,
        error: error ? (error instanceof Error ? error.message : "Failed to fetch") : null,
        updateSetting,
        get,
        refresh: refetch
    };
}
