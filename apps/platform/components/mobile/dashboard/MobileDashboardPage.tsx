"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useOrdersAggregates } from "@/hooks/use-orders-aggregates";
import { workQueueFromStatusCounts } from "@/lib/analytics/dashboard-work-queue";
import { baghdadHour } from "@/lib/analytics/dashboard-calculations";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { useDashboardMetricsQuery } from "@/hooks/use-dashboard-metrics-query";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { Plus } from "lucide-react";

import { MobileDashboardCards } from "./MobileDashboardCards";
import { TodayStrip } from "@/components/dashboard/widgets/today-strip";
import { OrderPipeline } from "@/components/dashboard/widgets/order-pipeline";
import { WidgetBoundary } from "@/components/dashboard/widget-boundary";
import { CreateOrderModal } from "@/components/orders/create-order-modal";

const UrgencyTriad = dynamic(() => import("@/components/dashboard/widgets/urgency-triad").then(mod => ({ default: mod.UrgencyTriad })), { ssr: false });
const DeliverySuccessRate = dynamic(() => import("@/components/dashboard/widgets/delivery-success-rate").then(mod => ({ default: mod.DeliverySuccessRate })), { ssr: false });

export function MobileDashboardPage() {
    // Creating an order needs no loaded book; the dashboard does not mount one.
    const { createOrder } = useOrderCrud();
    // ORD-2: server numbers only — see app/page.tsx. Skeleton until they arrive,
    // an error with a retry if they do not; never figures from the orders window.
    const metricsQuery = useDashboardMetricsQuery('all');
    const dashboardMetrics = metricsQuery.data;
    const aggregatesQuery = useOrdersAggregates({});
    const workQueue = useMemo(
        () => aggregatesQuery.data ? workQueueFromStatusCounts(aggregatesQuery.data.status_counts) : undefined,
        [aggregatesQuery.data],
    );
    const { t } = useLanguage();
    const { profile } = useAuth();
    const router = useRouter();

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    if (!dashboardMetrics && !metricsQuery.isError) {
        return (
            <div className="min-h-screen bg-[var(--background)]">
                <PageSkeleton />
            </div>
        );
    }

    if (!dashboardMetrics) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)]">
                <div className="pastel-card pastel-card-pink p-6 text-center w-full space-y-3" role="alert">
                    <h2 className="text-xl font-bold text-rose-900">{t("dashboard.errorTitle")}</h2>
                    <p className="text-rose-700">{t("dashboard.loadError.detail")}</p>
                    <button
                        type="button"
                        onClick={() => void metricsQuery.refetch()}
                        disabled={metricsQuery.isFetching}
                        className="px-5 py-2 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] font-semibold text-foreground disabled:opacity-60"
                    >
                        {t("dashboard.retry")}
                    </button>
                </div>
            </div>
        );
    }

    const getGreeting = () => {
        const hour = baghdadHour(new Date());
        if (hour < 12) return t("dashboard.greeting.morning");
        if (hour < 18) return t("dashboard.greeting.afternoon");
        return t("dashboard.greeting.evening");
    };

    return (
        <div className="flex flex-col min-h-screen bg-background pb-[calc(6rem+var(--safe-area-bottom))]">
            {/* Header */}
            {/* MOB-D2: without the inset the sticky header sits under the notch and the FAB
                under the home indicator. globals.css already defines these vars. */}
            <div className="px-4 py-6 pt-[calc(1.5rem+var(--safe-area-top))] bg-background sticky top-0 z-30 bg-opacity-90 backdrop-blur-md">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">
                        {getGreeting()}{profile?.display_name ? `, ${profile.display_name}` : ''}
                    </h1>
                    {/* DV-D2: dead Search/Bell duplicates removed — see app/page.tsx. */}
                </div>
                <p className="text-muted text-sm border-l-2 border-[var(--primary)] pl-2">
                    {t("dashboard.subtitle")}
                </p>
            </div>

            <div className="px-4 flex-1 space-y-6">
                {/* MOB-D1: today's numbers, the pipeline and the delivery rate were
                    missing from mobile entirely — classified in the audit as
                    accidental holes rather than deliberate simplification. All three
                    already ship mobile layouts (OrderPipeline has had a `md:hidden`
                    stacked list that nothing rendered) and are fed by the same server
                    metrics as desktop, so there is no second calculation to drift. */}
                <WidgetBoundary label="mobile-today-strip">
                    <TodayStrip metrics={dashboardMetrics.todayStrip} />
                </WidgetBoundary>

                {/* 1. Mobile Cards */}
                {workQueue ? (
                    <MobileDashboardCards
                        counts={workQueue}
                        ordersToday={dashboardMetrics.todayStrip.ordersToday}
                        revenueThisMonth={dashboardMetrics.monthForecast.revenueThisMonth}
                    />
                ) : aggregatesQuery.isError ? (
                    <WidgetLoadError onRetry={() => void aggregatesQuery.refetch()} className="h-64" />
                ) : (
                    <WidgetPending className="h-64" />
                )}

                <WidgetBoundary label="mobile-order-pipeline">
                    <OrderPipeline
                        stages={dashboardMetrics.pipeline}
                        onStageClick={(status) => router.push(`/orders?status=${status}`)}
                    />
                </WidgetBoundary>

                <WidgetBoundary label="mobile-delivery-rate">
                    <DeliverySuccessRate metrics={dashboardMetrics.deliveryRate} />
                </WidgetBoundary>

                {/* 2. Urgency Triad */}
                <div className="space-y-3">
                    <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase px-1">{t("dashboard.mobile.attentionRequired")}</h2>
                    <UrgencyTriad
                        metrics={dashboardMetrics.urgency}
                        onAction={() => { }}
                    />
                </div>

            </div>

            {/* Create Order FAB */}
            <button
                onClick={() => setIsCreateModalOpen(true)}
                className="fixed bottom-[calc(6rem+var(--safe-area-bottom))] right-[calc(1rem+var(--safe-area-right))] w-14 h-14 rounded-full bg-[var(--button-success)] text-white shadow-lg shadow-green-500/30 flex items-center justify-center z-40 hover:scale-105 active:scale-95 transition-all"
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
