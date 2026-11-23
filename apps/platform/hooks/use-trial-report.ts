"use client";

import { useQuery } from "@tanstack/react-query";
import { trialReportFactsSchema, type TrialReportFacts } from "@scheniders/shared/trial-report";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export const trialReportKey = (tenantId: string | null) => ["trial_report", tenantId] as const;

/**
 * The shop's trial report facts (Fermi B12 item 2), from my_trial_report
 * (20261119001240_trial_report.sql): its own numbers from signup to today, or
 * to the trial's end. The database answers the shop's admins and staff who
 * may see its finances, and refuses everyone else, so callers enable it for
 * those only.
 */
export function useTrialReport(enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery<TrialReportFacts>({
        queryKey: trialReportKey(tenantId),
        enabled: enabled && !!tenantId,
        // A report of the trial's days: minutes old is fine, and a new order shows on the next visit.
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("my_trial_report");
            if (error) throw error;
            return trialReportFactsSchema.parse(data);
        },
    });
}
