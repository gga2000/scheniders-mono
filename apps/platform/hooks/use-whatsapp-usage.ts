"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * The shop's WhatsApp messages (Fermi B2), as whatsapp_usage returns it
 * (20261116055117_fermi_whatsapp_guard.sql): the free-trial counter, whether
 * its automatic messages are paused to protect the shared number, and this
 * month's delivered messages by template. `charged_iqd` is null for a member
 * who may not see the shop's money.
 */
const usageSchema = z.object({
    trial: z.boolean(),
    trial_sent: z.number().int(),
    trial_cap: z.number().int(),
    paused: z.boolean(),
    month_start: z.string(),
    month: z.array(
        z.object({
            template_name: z.string().nullable(),
            category: z.enum(["utility", "marketing"]),
            count: z.number().int(),
            charged_iqd: z.number().int().nullable(),
        }),
    ),
});

export type WhatsAppUsage = z.infer<typeof usageSchema>;

export function useWhatsAppUsage(enabled = true) {
    const { tenantId } = useAuth();
    return useQuery<WhatsAppUsage>({
        queryKey: ["whatsapp_usage", tenantId],
        enabled: enabled && !!tenantId,
        staleTime: 60_000,
        queryFn: async () => {
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase.rpc("whatsapp_usage", { p_tenant_id: tenantId });
            if (error) throw error;
            return usageSchema.parse(data);
        },
    });
}
