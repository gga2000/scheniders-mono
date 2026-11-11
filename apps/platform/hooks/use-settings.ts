"use client";

import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";

export interface AppSetting {
    key: string;
    value: unknown;
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
    notification_settings: { toast_enabled: true },
};

// Stored as free JSON per tenant: a field of the wrong type reads as unset, and
// fields a form does not know are kept so saving it does not drop them.
const str = z.string().optional().catch(undefined);
const num = z.number().optional().catch(undefined);
const flag = z.boolean().optional().catch(undefined);
type Loose<T> = T & { [field: string]: unknown };
interface SettingValues {
    store_profile: Loose<{ name?: string; currency?: string; timezone?: string }>;
    inventory_rules: Loose<{ low_stock_threshold?: number; enable_stock_alerts?: boolean }>;
    print_settings: Loose<{ label_size?: string; show_price?: boolean; show_phone?: boolean; batch_grouping?: string }>;
    auto_archive: Loose<{ enabled?: boolean; days?: number; archive_canceled?: boolean; archive_delivered?: boolean }>;
    quick_actions: Loose<{ show_cancel?: boolean; show_reject?: boolean; show_whatsapp?: boolean; show_print?: boolean }>;
    notification_settings: Loose<{ toast_enabled?: boolean }>;
}
const SETTING_SCHEMAS: { [K in keyof SettingValues]: z.ZodType<SettingValues[K]> } = {
    store_profile: z.looseObject({ name: str, currency: str, timezone: str }).catch({}),
    inventory_rules: z.looseObject({ low_stock_threshold: num, enable_stock_alerts: flag }).catch({}),
    print_settings: z.looseObject({ label_size: str, show_price: flag, show_phone: flag, batch_grouping: str }).catch({}),
    auto_archive: z.looseObject({ enabled: flag, days: num, archive_canceled: flag, archive_delivered: flag }).catch({}),
    quick_actions: z.looseObject({ show_cancel: flag, show_reject: flag, show_whatsapp: flag, show_print: flag }).catch({}),
    notification_settings: z.looseObject({ toast_enabled: flag }).catch({}),
};
export type SettingValue<K extends keyof SettingValues> = SettingValues[K];

/** One setting, typed; an unreadable stored value reads as empty. */
export function readSetting<K extends keyof SettingValues>(settings: Record<string, unknown>, key: K): SettingValue<K> {
    return SETTING_SCHEMAS[key].parse(settings[key]);
}

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
