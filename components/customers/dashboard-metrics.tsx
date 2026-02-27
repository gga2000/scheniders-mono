"use client";

import { useState, useRef, useEffect } from "react";
import { motion, animate } from "framer-motion";
import { useBusinessMetrics } from "@/hooks/use-business-metrics";
import { formatIQD, cn } from "@/lib/utils";
import { Users, AlertTriangle, CreditCard, Star, Activity, TrendingUp, TrendingDown, RefreshCw, DollarSign, ShoppingCart, Zap, Crown, UserPlus, UserMinus, X } from "lucide-react";
import { StatCardsSkeleton } from "@/components/ui/skeletons";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// Stable format functions — defined OUTSIDE component to avoid re-creation
const formatShortIQD = (val: number) => {
    if (val >= 1000000) return `IQD ${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `IQD ${(val / 1000).toFixed(1)}k`;
    return `IQD ${Math.round(val)}`;
};

const formatPercent = (v: number) => `${v.toFixed(1)}%`;

function AnimatedCounter({ value, formatFn = (v: number) => Math.round(v).toLocaleString() }: { value: number, formatFn?: (v: number) => string }) {
    const [displayValue, setDisplayValue] = useState(formatFn(value));
    const formatRef = useRef(formatFn);
    formatRef.current = formatFn;

    useEffect(() => {
        const controls = animate(0, value, {
            duration: 1.2,
            ease: "easeOut",
            onUpdate(currentValue) {
                setDisplayValue(formatRef.current(currentValue));
            },
        });

        return () => controls.stop();
    }, [value]);

    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{displayValue}</span>;
}

export function CustomerDashboardMetrics({ isExpanded, onToggleExpand }: { isExpanded: boolean, onToggleExpand: () => void }) {
    return (
        <ErrorBoundary name="Customer Dashboard Metrics">
            <CustomerDashboardMetricsInner isExpanded={isExpanded} onToggleExpand={onToggleExpand} />
        </ErrorBoundary>
    );
}

function CustomerDashboardMetricsInner({ isExpanded, onToggleExpand }: { isExpanded: boolean, onToggleExpand: () => void }) {
    const { data: metrics, isLoading, isError } = useBusinessMetrics();

    if (isLoading) {
        return <StatCardsSkeleton count={1} />;
    }

    if (isError || !metrics) {
        return null;
    }

    // Derive display values from real data
    const activeCustomers = metrics.active_customers;
    const totalRevenue = metrics.total_revenue;
    const avgOrderValue = metrics.avg_order_value;
    const repeatRate = metrics.repeat_purchase_rate;
    const retentionRate = metrics.retention_rate;
    const revenueGrowth = metrics.revenue_growth_percent;
    const totalCustomers = metrics.total_customers;
    const totalOrders = metrics.total_orders;

    // Progress bar percentages (with minimum visual width of 8% so bars are always visible)
    const minBar = 8;
    const activePercent = totalCustomers > 0 ? Math.max(Math.min((activeCustomers / totalCustomers) * 100, 100), minBar) : minBar;
    const aovTarget = 50000; // IQD 50k target AOV
    const aovPercent = Math.max(Math.min((avgOrderValue / aovTarget) * 100, 100), minBar);
    const repeatPercent = Math.max(Math.min(repeatRate, 100), minBar);
    const revenueBarPercent = Math.max(Math.min(Math.abs(revenueGrowth) + 20, 100), 15);

    if (!isExpanded) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 flex-shrink-0 w-full h-auto">
                {/* Card 1: Active Customers (30 days) */}
                <div
                    onClick={onToggleExpand}
                    className="flex-1 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-[var(--card-border)] bg-[var(--card-bg)] dark:bg-[#1E1E1E] p-5 cursor-pointer group hover:bg-slate-50 dark:hover:bg-white/5 hover:-translate-y-1 transition-all duration-300 relative"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
                            retentionRate >= 50 ? "text-[#00ff9d] bg-[#00ff9d]/10" : "text-[#ff3366] bg-[#ff3366]/10"
                        )}>
                            {retentionRate.toFixed(1)}% retention
                        </span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 group-hover:text-foreground transition-colors">Active (30d)</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl md:text-3xl font-bold text-foreground">
                                <AnimatedCounter value={activeCustomers} />
                            </span>
                            <span className="text-xs text-muted-foreground">/ {totalCustomers}</span>
                        </div>
                    </div>
                    {/* Two retention bars */}
                    <div className="mt-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-12 shrink-0">Active</span>
                            <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-1000" style={{ width: `${activePercent}%` }} />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-12 shrink-0">Retain</span>
                            <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-gradient-to-r from-emerald-500 to-green-400 h-full rounded-full transition-all duration-1000" style={{ width: `${Math.max(retentionRate, 8)}%` }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Card 2: Total Revenue */}
                <div
                    onClick={onToggleExpand}
                    className="flex-1 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-[var(--card-border)] bg-[var(--card-bg)] dark:bg-[#1E1E1E] p-5 cursor-pointer group hover:bg-slate-50 dark:hover:bg-white/5 hover:-translate-y-1 transition-all duration-300 relative"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
                            revenueGrowth >= 0 ? "text-[#00ff9d] bg-[#00ff9d]/10" : "text-[#ff3366] bg-[#ff3366]/10"
                        )}>
                            {revenueGrowth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth.toFixed(1)}%
                        </span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 group-hover:text-foreground transition-colors">Total Revenue</p>
                        <span className="text-2xl md:text-3xl font-bold text-foreground">
                            <AnimatedCounter value={totalRevenue} formatFn={formatShortIQD} />
                        </span>
                    </div>
                    {/* Revenue growth bar */}
                    <div className="mt-3 w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                revenueGrowth >= 0
                                    ? "bg-gradient-to-r from-emerald-500 to-[#00ff9d] dark:shadow-[0_0_8px_rgba(0,255,157,0.4)]"
                                    : "bg-[#ff3366] dark:shadow-[0_0_8px_rgba(255,51,102,0.4)]"
                            )}
                            style={{ width: `${revenueBarPercent}%` }}
                        />
                    </div>
                </div>

                {/* Card 3: Avg Order Value */}
                <div
                    onClick={onToggleExpand}
                    className="flex-1 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-[var(--card-border)] bg-[var(--card-bg)] dark:bg-[#1E1E1E] p-5 cursor-pointer group hover:bg-slate-50 dark:hover:bg-white/5 hover:-translate-y-1 transition-all duration-300 relative"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center">
                            <ShoppingCart className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <span className="flex items-center gap-1 text-slate-500 bg-slate-500/10 px-2 py-1 rounded-full text-[10px] font-bold">per order</span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 group-hover:text-foreground transition-colors">Avg Order Value</p>
                        <span className="text-2xl md:text-3xl font-bold text-foreground">
                            <AnimatedCounter value={avgOrderValue} formatFn={formatShortIQD} />
                        </span>
                    </div>
                    {/* Progress bar for AOV vs target */}
                    <div className="mt-3 w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-500 to-violet-400 h-full rounded-full transition-all duration-1000" style={{ width: `${aovPercent}%` }} />
                    </div>
                </div>

                {/* Card 4: Repeat Rate */}
                <div
                    onClick={onToggleExpand}
                    className="flex-1 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-[var(--card-border)] bg-[var(--card-bg)] dark:bg-[#1E1E1E] p-5 cursor-pointer group hover:bg-slate-50 dark:hover:bg-white/5 hover:-translate-y-1 transition-all duration-300 relative"
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center">
                            <RefreshCw className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
                        </div>
                        <span className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
                            repeatRate >= 30 ? "text-[#00ff9d] bg-[#00ff9d]/10" : "text-[#ff3366] bg-[#ff3366]/10"
                        )}>
                            {repeatRate >= 30 ? "Strong" : "Needs work"}
                        </span>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 group-hover:text-foreground transition-colors">Repeat Rate</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl md:text-3xl font-bold text-foreground">
                                <AnimatedCounter value={repeatRate} formatFn={formatPercent} />
                            </span>
                        </div>
                    </div>
                    {/* Segmented bar showing rate — always light at least 1 */}
                    <div className="flex gap-1 mt-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-1.5 flex-1 rounded-full transition-all",
                                    i < Math.max(Math.ceil(repeatRate / 20), 1)
                                        ? "bg-yellow-400 dark:shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                                        : "bg-slate-200 dark:bg-slate-700/50"
                                )}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // EXPANDED VIEW — Chart + Side Stats
    return (
        <div className="flex flex-col xl:flex-row gap-4 md:gap-6 mb-6 flex-shrink-0 w-full h-auto">
            {/* Left Chart Card */}
            <div className="flex-1 rounded-2xl md:rounded-3xl relative overflow-hidden shadow-sm border border-[var(--card-border)] bg-[var(--card-bg)] dark:bg-[#1E1E1E] p-5 md:p-8 flex flex-col justify-between group">
                {/* Background Effects */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-white/20 to-transparent dark:from-[#2A2A2A] dark:via-[#1E1E1E] dark:to-[#1E1E1E] opacity-95 pointer-events-none" />

                <div className="relative z-10 flex flex-col h-full">
                    {/* Main Graph Content */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                        <div onClick={onToggleExpand} className="cursor-pointer group/title select-none">
                            <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-1 text-foreground flex items-center gap-2 group-hover/title:text-primary transition-colors">
                                Orders Over Time
                                <svg className="w-5 h-5 opacity-0 group-hover/title:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            </h2>
                            <p className="text-muted text-sm font-medium">Real-time tracking of order volume</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 text-foreground transition-colors hover:bg-white dark:hover:bg-white/10">Day</button>
                            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary dark:bg-primary/20 text-primary-foreground dark:text-primary border border-primary dark:border-primary/50 shadow-sm">Week</button>
                            <button className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 text-foreground transition-colors hover:bg-white dark:hover:bg-white/10">Month</button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-[140px] relative w-full mt-4 overflow-hidden rounded-xl">
                        {/* Chart Graphics */}
                        <div className="absolute inset-0 opacity-70">
                            <svg className="w-full h-full object-cover" preserveAspectRatio="none" viewBox="0 0 1000 200">
                                <defs>
                                    <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="0%" className="stop-color-primary" stopColor="currentColor" stopOpacity="0.3"></stop>
                                        <stop offset="100%" className="stop-color-primary" stopColor="currentColor" stopOpacity="0"></stop>
                                    </linearGradient>
                                </defs>
                                <path d="M0 150 C 100 140, 200 160, 300 120 S 500 80, 600 90 S 800 40, 1000 20 V 200 H 0 Z" fill="url(#chartGradient)" className="text-primary"></path>
                                <path className="drop-shadow-sm dark:drop-shadow-[0_0_10px_rgba(59,130,246,0.5)] text-primary" d="M0 150 C 100 140, 200 160, 300 120 S 500 80, 600 90 S 800 40, 1000 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3"></path>
                                <circle className="cursor-pointer hover:scale-150 transition-transform duration-300 fill-white dark:fill-[#1E1E1E] stroke-primary" cx="600" cy="90" r="4" strokeWidth="2"></circle>
                                <circle className="cursor-pointer hover:scale-150 transition-transform duration-300 fill-white dark:fill-[#1E1E1E] stroke-primary" cx="300" cy="120" r="4" strokeWidth="2"></circle>
                                <circle className="cursor-pointer hover:scale-150 transition-transform duration-300 fill-white dark:fill-[#1E1E1E] stroke-primary" cx="1000" cy="20" r="4" strokeWidth="2"></circle>
                            </svg>
                        </div>

                        {/* Chart Total Orders Hover Box */}
                        <div className="absolute top-1 md:top-4 left-1/2 md:left-[60%] bg-[#1E1E1E] dark:bg-[#1E1E1E]/95 backdrop-blur-md border border-[#333333] dark:border-white/10 rounded-2xl p-3 md:p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)] transform -translate-x-1/2 min-w-[160px]">
                            <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Total Orders</p>
                            <div className="flex items-end justify-between gap-3">
                                <span className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                                    <AnimatedCounter value={totalOrders} />
                                </span>
                                <span className={cn(
                                    "text-xs font-bold flex items-center px-1.5 py-0.5 rounded",
                                    retentionRate >= 50 ? "text-[#00ff9d] bg-[#00ff9d]/10" : "text-[#ff3366] bg-[#ff3366]/10"
                                )}>
                                    <TrendingUp className="w-3 h-3 mr-0.5" /> {retentionRate.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side Stats Column Card */}
            <div className="w-full xl:w-72 rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-[var(--card-border)] bg-[var(--card-bg)] dark:bg-[#1E1E1E] flex flex-row xl:flex-col divide-x xl:divide-x-0 xl:divide-y divide-[var(--card-border)]">
                {/* Total Revenue */}
                <div onClick={onToggleExpand} className="flex-1 p-5 group/stat cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted transition-colors group-hover/stat:text-foreground">Revenue</span>
                        <DollarSign className="w-4 h-4 text-emerald-500 opacity-80" />
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xl md:text-2xl font-bold text-foreground">
                            <AnimatedCounter value={totalRevenue} formatFn={formatShortIQD} />
                        </span>
                        <span className={cn("text-xs", revenueGrowth >= 0 ? "text-[#00ff9d]" : "text-[#ff3366]")}>
                            {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth.toFixed(1)}%
                        </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700/50 h-1.5 rounded-full overflow-hidden mt-2">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                revenueGrowth >= 0
                                    ? "bg-emerald-500 dark:shadow-[0_0_8px_rgba(0,255,157,0.6)]"
                                    : "bg-[#ff3366] dark:shadow-[0_0_8px_rgba(255,51,102,0.6)]"
                            )}
                            style={{ width: `${revenueBarPercent}%` }}
                        />
                    </div>
                </div>

                {/* Avg Order Value */}
                <div onClick={onToggleExpand} className="flex-1 p-5 group/stat cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted transition-colors group-hover/stat:text-foreground">Avg Order</span>
                        <ShoppingCart className="w-4 h-4 text-primary opacity-80" />
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xl md:text-2xl font-bold text-foreground">
                            <AnimatedCounter value={avgOrderValue} formatFn={formatShortIQD} />
                        </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700/50 h-1.5 rounded-full overflow-hidden mt-2">
                        <div className="bg-primary h-full rounded-full dark:shadow-[0_0_8px_rgba(59,130,246,0.6)]" style={{ width: `${aovPercent}%` }} />
                    </div>
                </div>

                {/* Repeat Rate */}
                <div onClick={onToggleExpand} className="flex-1 p-5 group/stat cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted transition-colors group-hover/stat:text-foreground">Repeat Rate</span>
                        <RefreshCw className="w-4 h-4 text-amber-500 opacity-80" />
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xl md:text-2xl font-bold text-foreground">
                            <AnimatedCounter value={repeatRate} formatFn={formatPercent} />
                        </span>
                    </div>
                    <div className="flex gap-0.5 mt-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-1.5 flex-1 rounded-full",
                                    i < Math.max(Math.round(repeatRate / 20), 1)
                                        ? "bg-yellow-400 dark:shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                                        : "bg-slate-200 dark:bg-slate-700/50"
                                )}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function InsightsDrawer({ onClose }: { onClose: () => void }) {
    return (
        <ErrorBoundary name="Insights Drawer">
            <InsightsDrawerInner onClose={onClose} />
        </ErrorBoundary>
    );
}

function InsightsDrawerInner({ onClose }: { onClose: () => void }) {
    const { data: metrics } = useBusinessMetrics();

    const retentionRate = metrics?.retention_rate ?? 0;
    const activeCustomers = metrics?.active_customers ?? 0;
    const atRiskCustomers = metrics?.at_risk_customers ?? 0;
    const repeatCustomers = metrics?.repeat_customers ?? 0;
    const vipCount = metrics?.vip_count ?? 0;
    const newCount = metrics?.new_count ?? 0;
    const totalCustomers = metrics?.total_customers ?? 1;
    const revenueGrowth = metrics?.revenue_growth_percent ?? 0;
    const totalRevenue = metrics?.total_revenue ?? 0;
    const avgLtv = metrics?.avg_customer_ltv ?? 0;

    const healthSegments = [
        { label: "Active (30d)", count: activeCustomers, color: "bg-[#00ff9d]", textColor: "text-[#00ff9d]", icon: Zap, percent: (activeCustomers / totalCustomers) * 100 },
        { label: "VIP Customers", count: vipCount, color: "bg-yellow-400", textColor: "text-yellow-400", icon: Crown, percent: (vipCount / totalCustomers) * 100 },
        { label: "New This Month", count: newCount, color: "bg-blue-400", textColor: "text-blue-400", icon: UserPlus, percent: (newCount / totalCustomers) * 100 },
        { label: "At Risk (90-180d)", count: atRiskCustomers, color: "bg-amber-500", textColor: "text-amber-500", icon: AlertTriangle, percent: (atRiskCustomers / totalCustomers) * 100 },
        { label: "Repeat Buyers", count: repeatCustomers, color: "bg-[#ff3366]", textColor: "text-[#ff3366]", icon: UserPlus, percent: (repeatCustomers / totalCustomers) * 100 },
    ];

    return (
        <div className="w-full flex flex-col relative bg-[var(--card-bg)] dark:bg-[#1E1E1E] rounded-2xl md:rounded-3xl border border-[var(--card-border)] shadow-sm overflow-hidden mb-4 xl:mb-0 h-full">
            <div className="p-4 pb-2 flex justify-between items-center z-10 border-b border-slate-200 dark:border-white/10">
                <h3 className="text-sm font-bold text-foreground tracking-wide">CUSTOMER INSIGHTS</h3>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-primary transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 pt-3 space-y-4 custom-scrollbar">
                {/* Retention Rate Card */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-3 border border-slate-700 shadow-lg text-white">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-blue-400" />
                        <h4 className="text-sm font-medium text-white">Retention Rate</h4>
                    </div>
                    <div className="flex items-end justify-between mb-2">
                        <span className="text-4xl font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{retentionRate.toFixed(1)}%</span>
                        <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded font-medium",
                            retentionRate >= 50 ? "text-[#00ff9d] bg-[#00ff9d]/10" : "text-[#ff3366] bg-[#ff3366]/10"
                        )}>
                            {retentionRate >= 50 ? "Healthy" : "Low"}
                        </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-3">All-time returning customers</p>
                    <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                retentionRate >= 50
                                    ? "bg-gradient-to-r from-blue-400 to-[#00ff9d] shadow-[0_0_10px_rgba(0,255,157,0.5)]"
                                    : "bg-gradient-to-r from-orange-400 to-[#ff3366] shadow-[0_0_10px_rgba(255,51,102,0.5)]"
                            )}
                            style={{ width: `${Math.min(retentionRate, 100)}%` }}
                        />
                    </div>
                </div>

                {/* Customer Health Breakdown */}
                <div>
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Customer Health</h4>
                    <div className="space-y-2.5">
                        {healthSegments.map((seg) => (
                            <div key={seg.label} className="group">
                                <div className="flex items-center gap-3 mb-1.5">
                                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 border-white dark:border-slate-700 shadow-sm group-hover:scale-110 transition-transform",
                                        seg.count > 0 ? "bg-slate-100 dark:bg-slate-800" : "bg-slate-50 dark:bg-slate-900"
                                    )}>
                                        <seg.icon className={cn("w-3 h-3", seg.textColor)} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">{seg.label}</span>
                                            <span className="text-xs font-bold text-foreground">{seg.count.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                                            <div className={cn("h-full rounded-full transition-all duration-700", seg.color)} style={{ width: `${Math.max(seg.percent, 2)}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Revenue Summary */}
                <div className="bg-primary/5 dark:bg-primary/10 rounded-2xl p-3 border border-primary/10">
                    <h4 className="text-xs font-bold text-primary mb-2">Revenue Summary</h4>
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between items-center text-xs mb-1">
                                <span className="text-muted-foreground">Total Revenue</span>
                                <span className="text-foreground font-bold">{formatShortIQD(totalRevenue)}</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-primary h-full w-full rounded-full dark:shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center text-xs mb-1">
                                <span className="text-muted-foreground">Avg Customer LTV</span>
                                <span className="text-foreground font-bold">{formatShortIQD(avgLtv)}</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-[var(--ink)] dark:bg-[#00ff9d] h-full rounded-full dark:shadow-[0_0_8px_rgba(0,255,157,0.5)]" style={{ width: `${Math.min((avgLtv / (totalRevenue / Math.max(totalCustomers, 1) * 2)) * 100, 100)}%` }} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                            <span className="text-xs text-muted-foreground">Month Growth</span>
                            <span className={cn(
                                "text-xs font-bold flex items-center gap-1",
                                revenueGrowth >= 0 ? "text-[#00ff9d]" : "text-[#ff3366]"
                            )}>
                                {revenueGrowth >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* System Status */}
            <div className="p-3 border-t border-slate-200 dark:border-white/10 mt-auto">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">System Status</span>
                    <span className="flex items-center text-[10px] text-[#00ff9d] gap-1.5 font-medium bg-[#00ff9d]/10 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-[#00ff9d] rounded-full animate-pulse" />
                        Operational
                    </span>
                </div>
            </div>
        </div>
    );
}
