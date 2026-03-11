"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

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

export function useSettings() {
    const [settings, setSettings] = useState<Record<string, any>>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // =============================================
    // INITIAL LOAD
    // =============================================

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from("app_settings")
                .select("*");

            if (fetchError) throw fetchError;

            if (data) {
                // Convert array of rows to kv object
                const settingsMap: Record<string, any> = { ...DEFAULT_SETTINGS };
                data.forEach((row: AppSetting) => {
                    settingsMap[row.key] = row.value;
                });
                setSettings(settingsMap);
            }
        } catch (err) {
            console.error("Error fetching settings:", err);
            // Don't set global error to avoid blocking UI, just log it and use defaults
        } finally {
            setLoading(false);
        }
    }

    // =============================================
    // UPDATE FUNCTION
    // =============================================

    const updateSetting = useCallback(async (key: string, newValue: any) => {
        // Capture previous value securely for potential rollback
        let previousValue: any;

        // Optimistic update
        setSettings((prev) => {
            previousValue = prev[key];
            return {
                ...prev,
                [key]: newValue,
            };
        });

        try {
            const { error: updateError } = await supabase
                .from("app_settings")
                .upsert({
                    key,
                    value: newValue,
                    updated_at: new Date().toISOString()
                })
                .select();

            if (updateError) throw updateError;

            return { success: true };
        } catch (err) {
            console.error(`Error updating setting ${key}:`, err);

            // Revert optimism on failure
            if (previousValue !== undefined) {
                setSettings((prev) => ({
                    ...prev,
                    [key]: previousValue,
                }));
            }

            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update setting"
            };
        }
    }, []);

    // Shortcut getter
    const get = useCallback((key: string) => {
        return settings[key] || DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS];
    }, [settings]);

    return {
        settings,
        loading,
        error,
        updateSetting,
        get,
        refresh: fetchSettings
    };
}
