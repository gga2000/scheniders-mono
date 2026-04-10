"use client";

import { useEffect, useRef, useState } from "react";
import { motion, animate } from "framer-motion";
import { formatIQD, cn } from "@/lib/utils";
import {
    Users,
    Crown,
    TrendingUp,
    Sparkles,
    DollarSign,
    Activity,
    AlertTriangle,
    UserMinus,
    ArrowUpRight,
    ArrowDownRight,
    Repeat,
    Target,
} from "lucide-react";
import { StatCardsSkeleton } from "@scheniders/ui/skeletons";

// --- Animated Counter Component --- //
function AnimatedCounter({
    value,
    formatFn = (v: number) => v.toString(),
}: {
    value: number;
    formatFn?: (v: number) => string;
}) {
    const [displayValue, setDisplayValue] = useState(formatFn(0));
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
        }

        const controls = animate(0, value, {
            duration: 1.5,
            ease: "easeOut",
            onUpdate(currentValue) {
                setDisplayValue(formatFn(currentValue));
            },
        });

        return () => controls.stop();
    }, [value, formatFn]);

    return <span>{displayValue}</span>;
}

interface BusinessMetrics {
    total_customers: number;
    total_revenue: number;
    vip_count: number;
    new_count: number; // New customers this month
    avg_order_value: number;
    active_customers: number; // Last 30 days
    at_risk_customers: number; // 90-180 days
    dormant_customers: number; // 180+ days
    revenue_growth_percent: number; // vs last month
    retention_rate: number; // Percentage
    avg_customer_ltv: number;
    repeat_purchase_rate: number; // Percentage
}

interface BusinessMetricsPanelProps {
    metrics?: BusinessMetrics;
    isLoading?: boolean;
    isError?: boolean;
}

export function BusinessMetricsPanel({
    metrics,
    isLoading = false,
    isError = false,
}: BusinessMetricsPanelProps) {
    if (isLoading) {
        return <StatCardsSkeleton count={12} />;
    }

    if (isError || !metrics) {
        return null; // Silently fail or return empty space
    }

    const isGrowthPositive = metrics.revenue_growth_percent >= 0;

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6 relative z-10">
            {/* Total Customers */}
            <MetricCard
                icon={Users}
                label="Total Customers"
                value={metrics.total_customers}
                formatFn={(v) => Math.round(v).toLocaleString()}
                color="blue"
            />

            {/* Total Revenue (LTV) */}
            <MetricCard
                icon={DollarSign}
                label="Total Revenue"
                value={metrics.total_revenue}
                formatFn={formatIQD}
                color="emerald"
            />

            {/* VIP Customers */}
            <MetricCard
                icon={Crown}
                label="VIP Customers"
                value={metrics.vip_count}
                formatFn={(v) => Math.round(v).toLocaleString()}
                color="amber"
            />

            {/* New Customers (This Month) */}
            <MetricCard
                icon={Sparkles}
                label="New This Month"
                value={metrics.new_count}
                formatFn={(v) => Math.round(v).toLocaleString()}
                color="violet"
            />

            {/* Average Order Value */}
            <MetricCard
                icon={Target}
                label="Avg Order Value"
                value={metrics.avg_order_value}
                formatFn={formatIQD}
                color="cyan"
            />

            {/* Active Customers (Last 30 days) */}
            <MetricCard
                icon={Activity}
                label="Active (30d)"
                value={metrics.active_customers}
                formatFn={(v) => Math.round(v).toLocaleString()}
                color="green"
            />

            {/* At-Risk Customers */}
            <MetricCard
                icon={AlertTriangle}
                label="At Risk"
                value={metrics.at_risk_customers}
                formatFn={(v) => Math.round(v).toLocaleString()}
                color="orange"
            />

            {/* Dormant Customers */}
            <MetricCard
                icon={UserMinus}
                label="Dormant (180d+)"
                value={metrics.dormant_customers}
                formatFn={(v) => Math.round(v).toLocaleString()}
                color="rose"
            />

            {/* Revenue Growth */}
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm relative overflow-hidden group">
                <div
                    className={cn(
                        "absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-10 -mt-10 transition-colors",
                        isGrowthPositive
                            ? "bg-green-500/5 group-hover:bg-green-500/10"
                            : "bg-red-500/5 group-hover:bg-red-500/10"
                    )}
                />
                <div className="flex items-center gap-3 mb-3 relative">
                    <div
                        className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            isGrowthPositive
                                ? "bg-green-50 dark:bg-green-400/10 text-green-600 dark:text-green-400"
                                : "bg-red-50 dark:bg-red-400/10 text-red-600 dark:text-red-400"
                        )}
                    >
                        {isGrowthPositive ? (
                            <ArrowUpRight className="w-5 h-5" />
                        ) : (
                            <ArrowDownRight className="w-5 h-5" />
                        )}
                    </div>
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted">
                            Revenue Growth
                        </p>
                    </div>
                </div>
                <p
                    className={cn(
                        "text-2xl lg:text-3xl font-bold relative",
                        isGrowthPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    )}
                >
                    <AnimatedCounter
                        value={metrics.revenue_growth_percent}
                        formatFn={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                    />
                </p>
            </div>

            {/* Retention Rate */}
            <MetricCard
                icon={Repeat}
                label="Retention Rate"
                value={metrics.retention_rate}
                formatFn={(v) => `${v.toFixed(1)}%`}
                color="indigo"
            />

            {/* Average Customer LTV */}
            <MetricCard
                icon={TrendingUp}
                label="Avg Customer LTV"
                value={metrics.avg_customer_ltv}
                formatFn={formatIQD}
                color="purple"
            />

            {/* Repeat Purchase Rate */}
            <MetricCard
                icon={Repeat}
                label="Repeat Purchase"
                value={metrics.repeat_purchase_rate}
                formatFn={(v) => `${v.toFixed(1)}%`}
                color="pink"
            />
        </div>
    );
}

// Reusable Metric Card Component
function MetricCard({
    icon: Icon,
    label,
    value,
    formatFn,
    color,
}: {
    icon: any;
    label: string;
    value: number;
    formatFn: (v: number) => string;
    color: "blue" | "emerald" | "amber" | "violet" | "cyan" | "green" | "orange" | "rose" | "indigo" | "purple" | "pink";
}) {
    const colorClasses = {
        blue: {
            bg: "bg-blue-500/5 group-hover:bg-blue-500/10",
            icon: "bg-blue-50 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400",
        },
        emerald: {
            bg: "bg-emerald-500/5 group-hover:bg-emerald-500/10",
            icon: "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400",
        },
        amber: {
            bg: "bg-amber-500/5 group-hover:bg-amber-500/10",
            icon: "bg-amber-50 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400",
        },
        violet: {
            bg: "bg-violet-500/5 group-hover:bg-violet-500/10",
            icon: "bg-violet-50 dark:bg-violet-400/10 text-violet-600 dark:text-violet-400",
        },
        cyan: {
            bg: "bg-cyan-500/5 group-hover:bg-cyan-500/10",
            icon: "bg-cyan-50 dark:bg-cyan-400/10 text-cyan-600 dark:text-cyan-400",
        },
        green: {
            bg: "bg-green-500/5 group-hover:bg-green-500/10",
            icon: "bg-green-50 dark:bg-green-400/10 text-green-600 dark:text-green-400",
        },
        orange: {
            bg: "bg-orange-500/5 group-hover:bg-orange-500/10",
            icon: "bg-orange-50 dark:bg-orange-400/10 text-orange-600 dark:text-orange-400",
        },
        rose: {
            bg: "bg-rose-500/5 group-hover:bg-rose-500/10",
            icon: "bg-rose-50 dark:bg-rose-400/10 text-rose-600 dark:text-rose-400",
        },
        indigo: {
            bg: "bg-indigo-500/5 group-hover:bg-indigo-500/10",
            icon: "bg-indigo-50 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400",
        },
        purple: {
            bg: "bg-purple-500/5 group-hover:bg-purple-500/10",
            icon: "bg-purple-50 dark:bg-purple-400/10 text-purple-600 dark:text-purple-400",
        },
        pink: {
            bg: "bg-pink-500/5 group-hover:bg-pink-500/10",
            icon: "bg-pink-50 dark:bg-pink-400/10 text-pink-600 dark:text-pink-400",
        },
    };

    const colors = colorClasses[color];

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-5 shadow-sm relative overflow-hidden group">
            <div className={cn("absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl -mr-10 -mt-10 transition-colors", colors.bg)} />
            <div className="flex items-center gap-3 mb-3 relative">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", colors.icon)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">
                        {label}
                    </p>
                </div>
            </div>
            <p className="text-2xl lg:text-3xl font-bold text-foreground relative">
                <AnimatedCounter value={value} formatFn={formatFn} />
            </p>
        </div>
    );
}
