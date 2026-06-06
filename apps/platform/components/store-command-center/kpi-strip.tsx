"use client";

import { ShoppingBag, Banknote, TrendingUp } from "lucide-react";
import { formatIQD } from "@scheniders/shared";
import type { StoreAnalytics } from "@/hooks/use-store-analytics";

interface KpiStripProps {
    analytics: StoreAnalytics | undefined;
    isLoading: boolean;
}

interface KpiCardProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    sub?: string;
    loading: boolean;
}

function KpiCard({ label, value, icon, sub, loading }: KpiCardProps) {
    return (
        <div className="glass-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    {icon}
                </div>
            </div>
            {loading ? (
                <div className="h-8 w-24 rounded-lg bg-muted animate-pulse" />
            ) : (
                <span className="text-2xl font-bold text-foreground tracking-tight">{value}</span>
            )}
            {sub && !loading && (
                <span className="text-[11px] text-muted-foreground">{sub}</span>
            )}
        </div>
    );
}

export function KpiStrip({ analytics, isLoading }: KpiStripProps) {
    const orderCount = analytics?.orderCount ?? 0;
    const revenue = analytics?.revenue ?? 0;
    const aov = orderCount > 0 ? revenue / orderCount : null;

    return (
        <div className="grid grid-cols-3 gap-3">
            <KpiCard
                label="Orders"
                value={isLoading ? "—" : String(orderCount)}
                icon={<ShoppingBag className="w-4 h-4" />}
                sub="Last 7 days"
                loading={isLoading}
            />
            <KpiCard
                label="Revenue"
                value={isLoading ? "—" : formatIQD(revenue)}
                icon={<Banknote className="w-4 h-4" />}
                sub="Last 7 days"
                loading={isLoading}
            />
            <KpiCard
                label="Avg. order value"
                value={isLoading ? "—" : aov !== null ? formatIQD(aov) : "—"}
                icon={<TrendingUp className="w-4 h-4" />}
                sub={orderCount === 0 ? "No orders yet" : undefined}
                loading={isLoading}
            />
        </div>
    );
}
