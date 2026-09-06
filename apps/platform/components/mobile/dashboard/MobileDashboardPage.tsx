"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useStats } from "@/hooks/use-stats";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import { useDashboardMetricsQuery } from "@/hooks/use-dashboard-metrics-query";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { Plus, Bell, Search } from "lucide-react";

import { MobileDashboardCards } from "./MobileDashboardCards";
import { CreateOrderModal } from "@/components/orders/create-order-modal";

const UrgencyTriad = dynamic(() => import("@/components/dashboard/widgets/urgency-triad").then(mod => ({ default: mod.UrgencyTriad })), { ssr: false });
// ProfitPulse removed — data source no longer in useDashboardMetrics

export function MobileDashboardPage() {
    const { orders, error, createOrder } = useOrdersContext();
    const { products } = useProductsCrud();
    const stats = useStats(orders);
    // Server metrics gate first paint; client computation is the fallback.
    const clientMetrics = useDashboardMetrics(orders, products || []);
    const { data: serverMetrics } = useDashboardMetricsQuery('all');
    const dashboardMetrics = serverMetrics ?? clientMetrics;
    const usingLocalFallback = !serverMetrics && !!clientMetrics;   // ENG-D1
    const { t } = useLanguage();
    const { profile } = useAuth();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    if (!dashboardMetrics) {
        return (
            <div className="min-h-screen bg-[var(--background)]">
                <PageSkeleton />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)]">
                <div className="pastel-card pastel-card-pink p-6 text-center w-full">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">{t("dashboard.errorTitle")}</h2>
                    <p className="text-rose-700">{error}</p>
                </div>
            </div>
        );
    }

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return t("dashboard.greeting.morning");
        if (hour < 18) return t("dashboard.greeting.afternoon");
        return t("dashboard.greeting.evening");
    };

    return (
        <div className="flex flex-col min-h-screen bg-background pb-24">
            {/* Header */}
            <div className="px-4 py-6 bg-background sticky top-0 z-30 bg-opacity-90 backdrop-blur-md">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">
                        {getGreeting()}{profile?.display_name ? `, ${profile.display_name}` : ''}
                    </h1>
                    <div className="flex gap-2">
                        <button className="w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm">
                            <Search className="w-4 h-4" />
                        </button>
                        <button className="relative w-10 h-10 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm">
                            <Bell className="w-4 h-4" />
                            {stats.newOrders > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--pastel-pink)] text-[8px] font-bold text-rose-900 flex items-center justify-center">
                                    {stats.newOrders > 99 ? '99+' : stats.newOrders}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
                <p className="text-muted text-sm border-l-2 border-[var(--primary)] pl-2">
                    {t("dashboard.subtitle")}
                </p>
            </div>

            <div className="px-4 flex-1 space-y-6">
                {usingLocalFallback && (
                    <div className="pastel-card pastel-card-yellow px-3 py-2 text-xs text-amber-900">
                        <span className="font-semibold">{t("dashboard.fallback.title")}</span>{' '}
                        <span className="text-amber-900/70">{t("dashboard.fallback.detail")}</span>
                    </div>
                )}

                {/* 1. Mobile Cards */}
                <MobileDashboardCards stats={stats} />

                {/* 2. Urgency Triad */}
                <div className="space-y-3">
                    <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase px-1">Attention Required</h2>
                    <UrgencyTriad
                        metrics={dashboardMetrics.urgency}
                        onAction={() => { }}
                    />
                </div>

                {/* 3. Profit Pulse — temporarily disabled, data source removed */}
            </div>

            {/* Create Order FAB */}
            <button
                onClick={() => setIsCreateModalOpen(true)}
                className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-[var(--button-success)] text-white shadow-lg shadow-green-500/30 flex items-center justify-center z-40 hover:scale-105 active:scale-95 transition-all"
            >
                <Plus className="w-6 h-6" />
            </button>

            <CreateOrderModal
                open={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreate={createOrder}
            />
        </div>
    );
}
