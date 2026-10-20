"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    Activity,
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    PhoneCall,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Truck,
} from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { ErrorBoundary } from "@scheniders/ui/error-boundary";
import { EASE_PANEL } from "@/components/layout/page-transition";
import { useOrdersContext } from "@/components/providers/orders-provider";
import type { OrderFilters } from "@/lib/supabase";

type OrdersContextValue = ReturnType<typeof useOrdersContext>;

interface OrdersAnalyticsPanelProps {
    /** 0 hides the panel, 1 shows the stat cards, 2 adds the detail row. */
    analyticsLevel: 0 | 1 | 2;
    stats: OrdersContextValue["stats"];
    statusCounts: OrdersContextValue["statusCounts"];
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
    /** Orders with a data-quality problem or a rejection, for "Needs Attention". */
    flaggedCount: number;
    /**
     * Urgent / no response / returns pending, each the length of the list its
     * click opens (useOrderFilters). Falls back to `stats` when absent.
     */
    attentionCounts?: OrdersContextValue["attentionCounts"];
    /**
     * Status and Needs Attention numbers render "—": the list they would
     * describe is not the one on screen (search, archive, a refinement, or a
     * window still loading). See lib/orders/count-visibility.ts.
     */
    countsHidden?: boolean;
    /** The Flagged number renders "—" (its own visibility rule). */
    flaggedCountHidden?: boolean;
    /**
     * Every figure taken over the loaded rows (conversion, velocity, peak
     * hour, today's revenue and orders, average order value) renders "—":
     * the rows on screen are a preview, not the window. The panel keeps its
     * level, so nothing below it moves when the figures arrive.
     */
    statsHidden?: boolean;
}

/** What a count shows while it would not describe the list on screen. */
const HIDDEN = "—";

/**
 * The collapsible analytics panel above the orders toolbar.
 *
 * ARCH-1: lifted out of app/orders/page.tsx verbatim. The markup is unchanged —
 * the layout is approved, and the point of the extraction is that the page file
 * stops being the only place any of it can be read or edited.
 */
export function OrdersAnalyticsPanel({
    analyticsLevel,
    stats,
    statusCounts,
    filters,
    setFilters,
    flaggedCount,
    attentionCounts,
    countsHidden = false,
    flaggedCountHidden = false,
    statsHidden = false,
}: OrdersAnalyticsPanelProps) {
    const { t } = useLanguage();
    const figure = (value: string | number) => (statsHidden ? HIDDEN : value);

    return (
        <AnimatePresence initial={false}>
            {analyticsLevel >= 1 && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: EASE_PANEL }}
                    className="overflow-hidden"
                >
                    <div className="space-y-4 pb-6">
                        {/* Main Stats Grid */}

                        <ErrorBoundary name="Analytics Dashboard">
                            {/* Main Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {/* New Orders - Premium Card */}
                                <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                        <Sparkles className="w-16 h-16 text-rose-500 rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                    </div>
                                    <div className="p-5 relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
                                                <Sparkles className="w-4 h-4" />
                                            </div>
                                            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">{t("orders.status.new")}</span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <h3 className="text-3xl font-bold text-rose-900 dark:text-white">{countsHidden ? HIDDEN : statusCounts.new}</h3>
                                            <span className="text-sm font-medium text-rose-600/80">orders</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Contacted - Premium Card */}
                                <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                        <PhoneCall className="w-16 h-16 text-amber-500 rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                    </div>
                                    <div className="p-5 relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-600">
                                                <PhoneCall className="w-4 h-4" />
                                            </div>
                                            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">{t("orders.status.contacted")}</span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <h3 className="text-3xl font-bold text-amber-900 dark:text-white">{countsHidden ? HIDDEN : statusCounts.contacted}</h3>
                                            <span className="text-sm font-medium text-amber-600/80">active</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Confirmed - Premium Card */}
                                <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-violet-50 to-purple-100/50 border border-violet-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                        <CheckCircle2 className="w-16 h-16 text-violet-500 rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                    </div>
                                    <div className="p-5 relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg bg-violet-100 text-violet-600">
                                                <CheckCircle2 className="w-4 h-4" />
                                            </div>
                                            <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">{t("orders.status.confirmed")}</span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <h3 className="text-3xl font-bold text-violet-900 dark:text-white">{countsHidden ? HIDDEN : statusCounts.confirmed}</h3>
                                            <span className="text-sm font-medium text-violet-600/80">ready</span>
                                        </div>
                                    </div>
                                </div>

                                {/* In Transit - Premium Card */}
                                <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-100 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
                                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity duration-300">
                                        <Truck className="w-16 h-16 text-orange-500 -rotate-12 group-hover:scale-110 group-hover:translate-x-2 transition-transform duration-500" />
                                    </div>
                                    <div className="p-5 relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
                                                <Truck className="w-4 h-4" />
                                            </div>
                                            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">{t("orders.status.inTransit")}</span>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <h3 className="text-3xl font-bold text-orange-900 dark:text-white">{countsHidden ? HIDDEN : statusCounts.in_transit}</h3>
                                            <span className="text-sm font-medium text-orange-600/80">shipped</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Conversion Rate - Premium Card */}
                                <div className="relative overflow-hidden rounded-2xl orders-analytics-card bg-white/60 backdrop-blur-md border border-white/40 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group ring-1 ring-black/5">
                                    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
                                        <TrendingUp className="w-16 h-16 text-emerald-500 -rotate-12 group-hover:scale-110 transition-transform duration-500" />
                                    </div>
                                    <div className="p-5 relative z-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600">
                                                <TrendingUp className="w-4 h-4" />
                                            </div>
                                            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">{t("orders.stats.conversion")}</span>
                                        </div>
                                        <div className="flex items-end gap-2">
                                            <h3 className="text-3xl font-bold text-foreground dark:text-white" data-stat="conversion">{figure(`${stats.conversionRate.toFixed(1)}%`)}</h3>
                                        </div>
                                        {/* Animated Progress Bar */}
                                        <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-1000 ease-out relative"
                                                data-stat-bar="conversion"
                                                style={{ width: statsHidden ? "0%" : `${stats.conversionRate}%` }}
                                            >
                                                <div className="absolute inset-0 bg-white/30 w-full animate-[shimmer_2s_infinite]" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Revenue Trends & Velocity Metrics Row (only at level 2) */}
                            {analyticsLevel >= 2 && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Operational Velocity */}
                                    <div className="pastel-card p-5 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Activity className="w-16 h-16 text-blue-500 rotate-12" />
                                        </div>
                                        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">{t("orders.stats.operationalVelocity")}</h4>
                                        <div className="space-y-4 relative z-10">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-foreground/70">{t("orders.stats.confirmSpeed")}</span>
                                                <span className="font-bold text-foreground" data-stat="confirm_speed">{figure(stats.velocityMetrics.avgNewToConfirmed)}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-foreground/70">{t("orders.stats.deliverySpeed")}</span>
                                                <span className="font-bold text-foreground" data-stat="delivery_speed">{figure(stats.velocityMetrics.avgConfirmedToDelivered)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                                                <span className="text-sm text-foreground/70">{t("orders.stats.peakHour")}</span>
                                                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md" data-stat="peak_hour">{figure(stats.peakTime)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Needs Attention */}
                                    <div className="pastel-card p-5 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <AlertTriangle className="w-16 h-16 text-red-500 -rotate-12" />
                                        </div>
                                        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">{t("orders.stats.needsAttention")}</h4>
                                        <div className="space-y-4 relative z-10">
                                            <div className="flex justify-between items-center group/item hover:bg-rose-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, riskLevel: 'flagged' })}>
                                                <div className="flex items-center gap-2">
                                                    <ShieldCheck className="w-4 h-4 text-rose-600" />
                                                    <span className="text-sm text-foreground/70">{t("orders.stats.flagged")}</span>
                                                </div>
                                                <span className="font-bold text-rose-600" data-attention="flagged">{flaggedCountHidden ? HIDDEN : flaggedCount}</span>
                                            </div>
                                            <div className="flex justify-between items-center group/item hover:bg-red-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, priority: 'urgent' })}>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                    <span className="text-sm text-foreground/70">{t("orders.stats.urgent")}</span>
                                                </div>
                                                <span className="font-bold text-red-600" data-attention="urgent">{countsHidden ? HIDDEN : (attentionCounts?.urgent ?? stats.urgentOrders)}</span>
                                            </div>
                                            <div className="flex justify-between items-center group/item hover:bg-orange-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, status: 'no_response' })}>
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-orange-400" />
                                                    <span className="text-sm text-foreground/70">{t("orders.stats.noResponse")}</span>
                                                </div>
                                                <span className="font-bold text-orange-600" data-attention="no_response">{countsHidden ? HIDDEN : (attentionCounts?.noResponse ?? stats.noResponseOrders)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100 group/item hover:bg-yellow-50/50 p-1 rounded-lg transition-colors cursor-pointer" onClick={() => setFilters({ ...filters, status: 'return_pending' })}>
                                                <span className="text-sm text-foreground/70">{t("orders.stats.returnsPending")}</span>
                                                <span className="font-bold text-yellow-600" data-attention="return_pending">{countsHidden ? HIDDEN : (attentionCounts?.returnPending ?? stats.returnPendingOrders)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Business Pulse */}
                                    <div className="pastel-card p-5 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <BarChart3 className="w-16 h-16 text-emerald-500 rotate-6" />
                                        </div>
                                        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-4">{t("orders.stats.businessPulse")}</h4>
                                        <div className="space-y-4 relative z-10">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-foreground/70">{t("orders.stats.revenue")}</span>
                                                <span className="font-bold text-emerald-600" data-stat="today_revenue">{figure(formatIQD(stats.todayRevenue))}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-foreground/70">{t("orders.stats.ordersCount")}</span>
                                                <span className="font-bold text-foreground" data-stat="today_orders">{figure(stats.todayOrders)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-100">
                                                <span className="text-sm text-foreground/70">{t("orders.stats.avgOrderValue")}</span>
                                                <span className="font-bold text-foreground" data-stat="average_order_value">{figure(formatIQD(stats.averageOrderValue))}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </ErrorBoundary>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
