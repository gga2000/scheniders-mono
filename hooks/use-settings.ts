"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AppSetting {
    key: string;
    value: any;
    description?: string;
    updated_at?: string;
    updated_by?: string;
}

// Default settings fallback
const DEFAULT_SETTINGS = {
    store_profile: { name: "Schneiders", currency: "IQD", timezone: "Asia/Baghdad" },
    delivery_fees: { default: 5000, baghdad: 5000, provinces: 8000, free_shipping_threshold: 0 },
    inventory_rules: { low_stock_threshold: 5, enable_stock_alerts: true },
    print_settings: { label_size: "4x6", show_price: true, show_phone: true, batch_grouping: "city" },
    auto_archive: { enabled: false, days: 60, archive_canceled: true, archive_delivered: true },
    quick_actions: { show_cancel: true, show_reject: true, show_whatsapp: true, "show_print": true },
    notification_settings: { sound_enabled: true, sound_url: "/sounds/notification.mp3", toast_enabled: true },
};

export const SETTINGS_QUERY_KEY = ["app-settings"];

export function useSettings() {
    const queryClient = useQueryClient();

    const { data: settings = DEFAULT_SETTINGS, isLoading: loading, error, refetch } = useQuery({
        queryKey: SETTINGS_QUERY_KEY,
        queryFn: async () => {
            const { data, error: fetchError } = await supabase
                .from("app_settings")
                .select("*");

            if (fetchError) throw fetchError;

            const settingsMap: Record<string, any> = { ...DEFAULT_SETTINGS };
            if (data) {
                data.forEach((row: AppSetting) => {
                    settingsMap[row.key] = row.value;
                });
            }
            return settingsMap;
        },
        staleTime: 1000 * 60 * 60, // 1 hour (settings rarely change without user interaction)
    });

    const updateMutation = useMutation({
        mutationFn: async ({ key, newValue }: { key: string; newValue: any }) => {
            const { error: updateError } = await supabase
                .from("app_settings")
                .upsert({
                    key,
                    value: newValue,
                    updated_at: new Date().toISOString()
                });

            if (updateError) throw updateError;
            return { key, newValue };
        },
        onMutate: async ({ key, newValue }) => {
            await queryClient.cancelQueries({ queryKey: SETTINGS_QUERY_KEY });
            const previousSettings = queryClient.getQueryData<Record<string, any>>(SETTINGS_QUERY_KEY);

            queryClient.setQueryData<Record<string, any>>(SETTINGS_QUERY_KEY, (old) => ({
                ...(old || DEFAULT_SETTINGS),
                [key]: newValue,
            }));

            return { previousSettings };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousSettings) {
                queryClient.setQueryData(SETTINGS_QUERY_KEY, context.previousSettings);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
        }
    });

    const updateSetting = useCallback(async (key: string, newValue: any) => {
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
        return (settings as Record<string, any>)[key] || DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS];
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
