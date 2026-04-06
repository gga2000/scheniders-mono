"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";
import { Clock, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TenantStatus {
    status: string;
    trial_ends_at: string | null;
    plan: string;
}

function computeDaysLeft(trialEndsAt: string | null): number | null {
    if (!trialEndsAt) return null;
    return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
    const { tenantId } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const { data: tenant } = useQuery({
        queryKey: ["tenant_status", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tenants")
                .select("status, trial_ends_at, plan")
                .eq("id", tenantId!)
                .single();
            if (error) throw error;
            return data as TenantStatus;
        },
        enabled: !!tenantId,
        staleTime: 60_000, // check every minute
    });

    if (!tenant) return null;

    // Don't show on settings/billing page (they're already there)
    if (pathname?.includes("/settings")) return null;

    const daysLeft = computeDaysLeft(tenant.trial_ends_at);
    const isTrialExpired = tenant.status === "trial" && daysLeft !== null && daysLeft <= 0;
    const isSuspended = tenant.status === "suspended";
    const isCancelled = tenant.status === "cancelled";
    const isTrialWarning = tenant.status === "trial" && daysLeft !== null && daysLeft <= 3 && daysLeft > 0;

    // Suspended / Cancelled — full block overlay
    if (isSuspended || isCancelled) {
        return (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl p-8 max-w-md text-center shadow-2xl">
                    <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <XCircle className="w-7 h-7 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        {isSuspended ? "Account Suspended" : "Account Cancelled"}
                    </h2>
                    <p className="text-gray-600 text-sm mb-6">
                        {isSuspended
                            ? "Your account has been suspended due to insufficient balance. Please top up your wallet to continue."
                            : "Your subscription has been cancelled. Please contact support to reactivate."}
                    </p>
                    <button
                        onClick={() => router.push("/settings")}
                        className="w-full py-3 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors"
                    >
                        Go to Billing Settings
                    </button>
                </div>
            </div>
        );
    }

    // Trial expired — banner with strong CTA
    if (isTrialExpired) {
        return (
            <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-medium">Your free trial has expired.</span>
                <button
                    onClick={() => router.push("/settings")}
                    className="px-3 py-1 rounded-lg bg-white text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors"
                >
                    Choose a Plan
                </button>
            </div>
        );
    }

    // Trial warning — last 3 days
    if (isTrialWarning) {
        return (
            <div className={cn(
                "px-4 py-2 flex items-center justify-center gap-3 text-sm",
                daysLeft! <= 1
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-800"
            )}>
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                    {daysLeft === 1
                        ? "Your trial ends tomorrow!"
                        : `${daysLeft} days left in your free trial.`}
                </span>
                <button
                    onClick={() => router.push("/settings")}
                    className={cn(
                        "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
                        daysLeft! <= 1
                            ? "bg-white text-amber-700 hover:bg-amber-50"
                            : "bg-amber-700 text-white hover:bg-amber-800"
                    )}
                >
                    View Plans
                </button>
            </div>
        );
    }

    return null;
}
