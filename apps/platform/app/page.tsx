"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useStats } from "@/hooks/use-stats";
import { Plus, Search, Bell } from "lucide-react";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import { filterOrdersByDateRange, DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import { useAuth } from "@/hooks/use-auth";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { RevealToggle } from "@/components/ui/reveal-toggle";
import { useViewport } from "@/hooks/use-viewport";
import { MobileDashboardPage } from "@/components/mobile/dashboard/MobileDashboardPage";
import { DateRangeFilter } from "@/components/dashboard/widgets/date-range-filter";
import { TodayStrip } from "@/components/dashboard/widgets/today-strip";
import { OrderPipeline } from "@/components/dashboard/widgets/order-pipeline";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { useLanguage } from "@/hooks/use-language";
import { useAnnouncements } from "@/hooks/use-announcements";
import { perfTrace } from "@/lib/perf-trace";
import { useDashboardMetricsQuery } from "@/hooks/use-dashboard-metrics-query";
import { diag } from "@/lib/diag";

// Dynamic imports — all chart + operational widgets
const Leaderboard = dynamic(() => import("@/components/dashboard/widgets/leaderboard").then(mod => ({ default: mod.Leaderboard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const IraqMap = dynamic(() => import("@/components/shared/iraq-map").then(mod => ({ default: mod.IraqMap })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const RevenueTrendChart = dynamic(() => import("@/components/dashboard/widgets/revenue-trend-chart").then(mod => ({ default: mod.RevenueTrendChart })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const DeliverySuccessRate = dynamic(() => import("@/components/dashboard/widgets/delivery-success-rate").then(mod => ({ default: mod.DeliverySuccessRate })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const OrdersPerHour = dynamic(() => import("@/components/dashboard/widgets/orders-per-hour").then(mod => ({ default: mod.OrdersPerHour })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const PeakHoursHeatmap = dynamic(() => import("@/components/dashboard/widgets/peak-hours-heatmap").then(mod => ({ default: mod.PeakHoursHeatmap })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const AvgTimePerStage = dynamic(() => import("@/components/dashboard/widgets/avg-time-per-stage").then(mod => ({ default: mod.AvgTimePerStage })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const WeekOverWeek = dynamic(() => import("@/components/dashboard/widgets/week-over-week").then(mod => ({ default: mod.WeekOverWeek })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const MonthForecast = dynamic(() => import("@/components/dashboard/widgets/month-forecast").then(mod => ({ default: mod.MonthForecast })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const RejectionBreakdown = dynamic(() => import("@/components/dashboard/widgets/rejection-breakdown").then(mod => ({ default: mod.RejectionBreakdown })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const ProductLeaderboard = dynamic(() => import("@/components/dashboard/widgets/product-leaderboard").then(mod => ({ default: mod.ProductLeaderboard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const RecentOrdersFeed = dynamic(() => import("@/components/dashboard/widgets/recent-orders-feed").then(mod => ({ default: mod.RecentOrdersFeed })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const StaffLeaderboard = dynamic(() => import("@/components/dashboard/widgets/staff-leaderboard").then(mod => ({ default: mod.StaffLeaderboard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const TeamAnnouncements = dynamic(() => import("@/components/dashboard/widgets/team-announcements").then(mod => ({ default: mod.TeamAnnouncements })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });

export default function Home() {
  const { orders, error, createOrder } = useOrdersContext();
  const { products } = useProductsCrud();
  const stats = useStats(orders);
  // Server-computed metrics (fast, ~KB) gate first paint instead of the full
  // 12k-row orders fetch. The client computation is kept as a fallback (if the
  // RPC errors) and as a dev-only parallel-run drift check.
  const clientMetrics = useDashboardMetrics(orders, products || []);
  const { data: serverMetrics } = useDashboardMetricsQuery('all');
  const dashboardMetrics = serverMetrics ?? clientMetrics;
  const { t } = useLanguage();
  const { profile, role } = useAuth();
  const { isMobile } = useViewport();
  const router = useRouter();

  // Sourced from FinancialVisibilityProvider so the RevealToggle can flip
  // every financial widget at once. canReveal is the static permission gate;
  // showFinancials is the dynamic per-user state behind the eye icon.
  const { revealed: showFinancials, canReveal } = useFinancialVisibility();
  const isAdmin = role === 'admin';

  const { announcements, loading: announcementsLoading, error: announcementsError, createAnnouncement, togglePin, deleteAnnouncement } = useAnnouncements();

  const [dateRange, setDateRange] = useState<DateRangeKey>('7d');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- hydration guard
  }, []);

  // Mark the moment the dashboard's first real (non-skeleton) render commits.
  // perfTrace.mark is first-wins, so this records only the initial paint and
  // auto-emits the critical-path summary to the console.
  useEffect(() => {
    if (isMounted && dashboardMetrics) {
      perfTrace.mark('dashboard:first-paint');
    }
  }, [isMounted, dashboardMetrics]);

  const rangeOrders = useMemo(
    () => filterOrdersByDateRange(orders, dateRange),
    [orders, dateRange]
  );
  const { data: serverRangeMetrics } = useDashboardMetricsQuery(dateRange);
  const clientRangeMetrics = useDashboardMetrics(rangeOrders, products || []);
  const rangeMetrics = serverRangeMetrics ?? clientRangeMetrics;

  // Dev-only parallel-run drift check: once the client has computed metrics from
  // the loaded orders array, compare key server vs client numbers. Lets us prove
  // the SQL function matches before fully retiring the client path.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !serverMetrics || !clientMetrics) return;
    const cmp: Array<[string, number | null, number | null]> = [
      ['pipeline.new', serverMetrics.pipeline.find(p => p.status === 'new')?.count ?? -1, clientMetrics.pipeline.find(p => p.status === 'new')?.count ?? -1],
      ['todayStrip.ordersToday', serverMetrics.todayStrip.ordersToday, clientMetrics.todayStrip.ordersToday],
      ['funnel.total', serverMetrics.funnel[0]?.value ?? -1, clientMetrics.funnel[0]?.value ?? -1],
      ['deliveryRate.current', serverMetrics.deliveryRate.currentRate, clientMetrics.deliveryRate.currentRate],
      ['monthForecast.ordersThisMonth', serverMetrics.monthForecast.ordersThisMonth, clientMetrics.monthForecast.ordersThisMonth],
    ];
    const drift = cmp.filter(([, s, c]) => s !== c);
    if (drift.length === 0) diag.log('[Diag:MetricsDrift] OK — server matches client on sampled metrics');
    else drift.forEach(([k, s, c]) => diag.warn(`[Diag:MetricsDrift] DRIFT ${k}: server=${s} client=${c}`));
  }, [serverMetrics, clientMetrics]);

  const ENABLE_MOBILE = true;

  if (!isMounted || !dashboardMetrics) {
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t("dashboard.greeting.morning");
    if (hour < 18) return t("dashboard.greeting.afternoon");
    return t("dashboard.greeting.evening");
  };

  const handleStatCardClick = (status: 'new' | 'confirmed' | 'rejected') => {
    router.push(`/orders?status=${status}`);
  };

  const handlePipelineStageClick = (status: string) => {
    router.push(`/orders?status=${status}`);
  };

  return (
    <div className="min-h-screen p-6 md:p-8 bg-[var(--background)]">
      <div className="max-w-[1920px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              {getGreeting()}{profile?.display_name ? `, ${profile.display_name}` : ''}
            </h1>
            <p className="text-muted mt-2 text-lg">
              {t("dashboard.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {canReveal && (
              <div className="inline-flex items-center gap-1.5 px-3 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm" title={showFinancials ? "Hide financial data" : "Show financial data"}>
                <RevealToggle size={18} />
                <span className="text-xs font-semibold text-muted-foreground select-none">
                  {showFinancials ? "Hide" : "Show"}
                </span>
              </div>
            )}
            <DateRangeFilter value={dateRange} onChange={setDateRange} />

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

        {/* Today at a Glance */}
        <TodayStrip metrics={dashboardMetrics.todayStrip} />

        {/* Stats Grid */}
        <StatsGrid stats={stats} onCardClick={handleStatCardClick} />

        {/* Order Pipeline */}
        <OrderPipeline
          stages={rangeMetrics?.pipeline ?? dashboardMetrics.pipeline}
          onStageClick={handlePipelineStageClick}
        />

        {/* Charts Row: Trend (7col) | Delivery Rate + Hourly (5col) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 min-h-[320px]">
            <RevenueTrendChart orders={orders} showRevenue={showFinancials} />
          </div>
          <div className="xl:col-span-5 flex flex-col gap-6">
            <DeliverySuccessRate metrics={dashboardMetrics.deliveryRate} />
            <OrdersPerHour data={dashboardMetrics.ordersPerHour} />
          </div>
        </div>

        {/* Heatmap Row: Peak Hours (8col) | Avg Time Per Stage (4col) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 min-h-[280px]">
            <PeakHoursHeatmap data={dashboardMetrics.peakHeatmap} />
          </div>
          <div className="xl:col-span-4 min-h-[280px]">
            <AvgTimePerStage metrics={dashboardMetrics.avgTimePerStage} />
          </div>
        </div>

        {/* Intelligence Row: WoW | Forecast | Rejection */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-12 gap-6">
          <div className="md:col-span-1 xl:col-span-4 min-h-[240px]">
            <WeekOverWeek metrics={dashboardMetrics.weekOverWeek} />
          </div>
          <div className="md:col-span-1 xl:col-span-4 min-h-[240px]">
            <MonthForecast forecast={dashboardMetrics.monthForecast} />
          </div>
          <div className="md:col-span-1 xl:col-span-4 min-h-[240px]">
            <RejectionBreakdown cityRejectionStats={dashboardMetrics.urgency.cityRejectionStats} />
          </div>
        </div>

        {/* Map | Top Cities + Top Products (two tall columns to the right of the map) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-6 h-[400px] xl:h-[460px]">
            <IraqMap orders={orders} />
          </div>
          <div className="xl:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6 xl:h-[460px]">
            <Leaderboard cities={dashboardMetrics.enhancedLeaderboard.topCities} />
            <ProductLeaderboard
              products={dashboardMetrics.enhancedLeaderboard.topProductsEnhanced}
            />
          </div>
        </div>

        {/* Operational Row: Recent Orders | Staff Leaderboard (admin) | Announcements */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Recent Orders Feed */}
          <div className={`xl:col-span-5 h-[440px]`}>
            <RecentOrdersFeed
              orders={dashboardMetrics.recentOrders}
            />
          </div>

          {/* Staff Leaderboard — admin only */}
          {isAdmin ? (
            <div className="xl:col-span-4 h-[440px]">
              <StaffLeaderboard staff={dashboardMetrics.staffLeaderboard} />
            </div>
          ) : (
            /* Non-admins: announcements takes more space */
            null
          )}

          {/* Team Announcements */}
          <div className={`${isAdmin ? 'xl:col-span-3' : 'xl:col-span-7'} h-[440px]`}>
            <TeamAnnouncements
              announcements={announcements}
              isAdmin={isAdmin}
              loading={announcementsLoading}
              error={announcementsError}
              onCreate={createAnnouncement}
              onTogglePin={togglePin}
              onDelete={deleteAnnouncement}
            />
          </div>
        </div>

        <CreateOrderModal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={createOrder}
        />
      </div>
    </div>
  );
}
