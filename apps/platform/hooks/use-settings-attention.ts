"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useBillingLock } from "@/hooks/use-billing-lock";
import { readSetting, useSettings } from "@/hooks/use-settings";
import { useTenant } from "@/hooks/use-tenant";
import { supabase } from "@/lib/supabase";
import { settingsAttention, type SettingsAttentionItem } from "@/lib/settings-attention";

export interface StoreSnapshot {
    /** The shop's name as the storefront and WhatsApp chats show it. */
    name: string;
    city: string | null;
    logoUrl: string | null;
    /** "" when the shop has no storefront WhatsApp number. */
    whatsappNumber: string;
}

/**
 * The few shop fields the Settings overview, the gear badge and the previews show. Under the
 * ["tenant", tenantId] prefix, so saving Store info (which invalidates that
 * prefix) refreshes it.
 */
export function useStoreSnapshot(enabled = true) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["tenant", tenantId, "settings-snapshot"],
        enabled: enabled && !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<StoreSnapshot> => {
            const { data, error } = await supabase
                .from("tenants")
                .select(
                    "business_name, city, logo:branding->>logo_url, builder_logo:store_config_v2->brand_kit->identity->>logo_url, whatsapp:store_config->contact->>whatsapp_number",
                )
                .eq("id", tenantId!)
                .maybeSingle();
            if (error) throw error;
            const row = data as {
                business_name: string | null;
                city: string | null;
                logo: string | null;
                builder_logo: string | null;
                whatsapp: string | null;
            } | null;
            return {
                name: row?.business_name?.trim() ?? "",
                city: row?.city?.trim() || null,
                // Store info's logo first, else the one the store editor saved (what most shops have).
                logoUrl: row?.logo?.trim() || row?.builder_logo?.trim() || null,
                whatsappNumber: row?.whatsapp?.trim() ?? "",
            };
        },
    });
}

/** The Settings items that need the shop now (see lib/settings-attention.ts). */
export function useSettingsAttention(enabled = true): SettingsAttentionItem[] {
    const { data: tenant } = useTenant();
    const { data: lock } = useBillingLock(enabled);
    const { settings, loaded: settingsLoaded } = useSettings();
    const { data: snapshot } = useStoreSnapshot(enabled);

    if (!enabled) return [];
    const staffAlerts = settingsLoaded ? readSetting(settings, "staff_alert_numbers") : null;
    return settingsAttention({
        tenant: tenant ? { status: tenant.status, plan: tenant.plan ?? null } : null,
        lock: lock ?? null,
        staffAlertNumbers: staffAlerts ? (staffAlerts.numbers?.length ?? 0) : null,
        whatsappNumber: snapshot ? snapshot.whatsappNumber : null,
    });
}
