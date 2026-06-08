"use client";

import { ShoppingBag, Banknote, TrendingUp } from "lucide-react";
import { formatIQD } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import type { StoreAnalytics } from "@/hooks/use-store-analytics";

interface KpiStripProps {
    analytics: StoreAnalytics | undefined;
    isLoading: boolean;
}

interface KpiCardProps {
    label: string;
    value: string;
    icon: React.ReactNode;
    /** Tinted icon-tile classes (bg + text), keyed to the metric. */
    tint: string;
    sub?: string;
    loading: boolean;
}

function KpiCard({ label, value, icon, tint, sub, loading }: KpiCardProps) {
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-(--card-bg) p-5 shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-0.5 hover:shadow-(--card-shadow-hover)">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tint)}>
                    {icon}
                </div>
            </div>
            {loading ? (
                <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
            ) : (
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</span>
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
                icon={<ShoppingBag className="h-4 w-4" />}
                tint="bg-blue-100 text-blue-700"
                sub="Last 7 days"
                loading={isLoading}
            />
            <KpiCard
                label="Revenue"
                value={isLoading ? "—" : formatIQD(revenue)}
                icon={<Banknote className="h-4 w-4" />}
                tint="bg-emerald-100 text-emerald-700"
                sub="Last 7 days"
                loading={isLoading}
            />
            <KpiCard
                label="Avg. order value"
                value={isLoading ? "—" : aov !== null ? formatIQD(aov) : "—"}
                icon={<TrendingUp className="h-4 w-4" />}
                tint="bg-violet-100 text-violet-700"
                sub={orderCount === 0 ? "No orders yet" : undefined}
                loading={isLoading}
            />
        </div>
    );
}
