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

// Default settings fallback. Only keys something in the app reads live here:
// the Settings page used to save store_profile, delivery_fees, inventory_rules,
// auto_archive, quick_actions and notification_settings, but no page, label or
// checkout ever read them, so they were removed with the page rebuild.
const DEFAULT_SETTINGS: Record<string, unknown> = {
    print_settings: { fragile_warning: false, no_open_warning: false },
};

// Stored as free JSON per tenant: a field of the wrong type reads as unset, and
// fields a form does not know are kept so saving it does not drop them.
const flag = z.boolean().optional().catch(undefined);
type Loose<T> = T & { [field: string]: unknown };
interface SettingValues {
    print_settings: Loose<{ fragile_warning?: boolean; no_open_warning?: boolean }>;
    /** Written by /api/settings/staff-alert (lib/staff-alerts.ts); read here for the Settings overview. */
    staff_alert_numbers: Loose<{ enabled?: boolean; numbers?: unknown[] }>;
}
const SETTING_SCHEMAS: { [K in keyof SettingValues]: z.ZodType<SettingValues[K]> } = {
    print_settings: z.looseObject({ fragile_warning: flag, no_open_warning: flag }).catch({}),
    staff_alert_numbers: z.looseObject({ enabled: flag, numbers: z.array(z.unknown()).optional().catch(undefined) }).catch({}),
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

    const { data: settings = DEFAULT_SETTINGS, isLoading: loading, isSuccess: loaded, error, refetch } = useQuery({
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
        /** True once the shop's saved rows are in (until then `settings` holds only the defaults). */
        loaded,
        error: error ? (error instanceof Error ? error.message : "Failed to fetch") : null,
        updateSetting,
        get,
        refresh: refetch
    };
}
