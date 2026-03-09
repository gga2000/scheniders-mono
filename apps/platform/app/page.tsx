"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { LiveFeed } from "@/components/dashboard/live-feed";
// New Dashboard Widgets

import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useStats } from "@/hooks/use-stats";
import { Plus, Search, Bell } from "lucide-react";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import { useAuth } from "@/hooks/use-auth";
import { useViewport } from "@/hooks/use-viewport";
import { MobileDashboardPage } from "@/components/mobile/dashboard/MobileDashboardPage";
const UrgencyTriad = dynamic(() => import("@/components/dashboard/widgets/urgency-triad").then(mod => ({ default: mod.UrgencyTriad })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const OrderFunnel = dynamic(() => import("@/components/dashboard/widgets/funnel-chart").then(mod => ({ default: mod.OrderFunnel })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const VelocityMatrix = dynamic(() => import("@/components/dashboard/widgets/velocity-matrix").then(mod => ({ default: mod.VelocityMatrix })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const CohortGrid = dynamic(() => import("@/components/dashboard/widgets/cohort-grid").then(mod => ({ default: mod.CohortGrid })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const TargetRings = dynamic(() => import("@/components/dashboard/widgets/target-rings").then(mod => ({ default: mod.TargetRings })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const ProfitPulse = dynamic(() => import("@/components/dashboard/widgets/profit-pulse").then(mod => ({ default: mod.ProfitPulse })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const Leaderboard = dynamic(() => import("@/components/dashboard/widgets/leaderboard").then(mod => ({ default: mod.Leaderboard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const GeoMap = dynamic(() => import("@/components/dashboard/widgets/geo-map").then(mod => ({ default: mod.GeoMap })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
import { PageSkeleton } from "@/components/ui/skeletons";
import { useLanguage } from "@/hooks/use-language";

export default function Home() {
  const { orders, loading, error, updateOrderStatus, createOrder } = useOrdersContext();
  const { products } = useProductsCrud();
  const stats = useStats(orders);
  const dashboardMetrics = useDashboardMetrics(orders, products || []);
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { isMobile } = useViewport();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Feature flag for mobile dashboard
  const ENABLE_MOBILE = true;

  if (!isMounted || loading || !dashboardMetrics) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <PageSkeleton />
      </div>
    );
  }

  if (isMobile && ENABLE_MOBILE) {
    return <MobileDashboardPage />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="pastel-card pastel-card-pink p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-rose-900 mb-2">{t("dashboard.errorTitle")}</h2>
          <p className="text-rose-700">{error}</p>
        </div>
      </div>
    );
  }

  // Get current greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("dashboard.greeting.morning");
    if (hour < 18) return t("dashboard.greeting.afternoon");
    return t("dashboard.greeting.evening");
  };

  return (
    <div className="min-h-screen p-6 md:p-8 bg-[var(--background)]">
      <div className="max-w-[1920px] mx-auto space-y-8">

        {/* Top Header Bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              {getGreeting()}{profile?.display_name ? `, ${profile.display_name}` : ''}
            </h1>
            <p className="text-muted mt-2 text-lg">
              {t("dashboard.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm">
              <Search className="w-5 h-5" />
            </button>

            <button className="relative w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm">
              <Bell className="w-5 h-5" />
              {stats.newOrders > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--pastel-pink)] text-[10px] font-bold text-rose-900 flex items-center justify-center">
                  {stats.newOrders > 99 ? '99+' : stats.newOrders}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--button-success)] text-white shadow-lg shadow-green-500/20 hover:bg-[var(--button-success-hover)] hover:shadow-green-500/30 hover:scale-[1.02] transition-all font-semibold"
            >
              <Plus className="h-5 w-5" />
              <span>{t("dashboard.newOrder")}</span>
            </button>
          </div>
        </div>

        {/* 1. Stats Grid (Legacy but loved) */}
        <StatsGrid stats={stats} />

        {/* 2. Urgency Triad (Immediate Action) */}
        <UrgencyTriad
          metrics={dashboardMetrics.urgency}
          onAction={() => { }}
        />

        {/* 3. Main Intelligence Grid (Bento Layout) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

          {/* Left Column: Financials & Flows (8 cols) */}
          <div className="xl:col-span-8 flex flex-col gap-6">

            {/* Row 1: Pulse & Targets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[280px]">
              <ProfitPulse data={dashboardMetrics.profitPulse} />
              <TargetRings
                revenue={dashboardMetrics.profitPulse.today}
                orders={stats.todayOrders}
              />
            </div>

            {/* Row 2: Funnel */}
            <div className="h-[350px]">
              <OrderFunnel data={dashboardMetrics.funnel} />
            </div>

            {/* Row 3: Cohorts */}
            <div className="h-[300px]">
              <CohortGrid data={dashboardMetrics.cohorts} />
            </div>

          </div>

          {/* Right Column: Geo & Products (4 cols) */}
          <div className="xl:col-span-4 flex flex-col gap-6">

            {/* Geo Map */}
            <div className="h-[400px]">
              <GeoMap data={dashboardMetrics.urgency} />
            </div>

            {/* Leaderboards */}
            <div className="flex-1 min-h-[400px]">
              <Leaderboard data={dashboardMetrics.leaderboard} />
            </div>

          </div>
        </div>

        {/* 4. Deep Dive: Velocity Matrix (Full Width) */}
        <div className="h-[500px]">
          <VelocityMatrix data={dashboardMetrics.velocity} />
        </div>

        {/* Create Order Modal */}
        <CreateOrderModal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={createOrder}
        />
      </div>
    </div>
  );
}
