"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useStats } from "@/hooks/use-stats";
import { Plus, Download } from "lucide-react";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import { filterOrdersByDateRange, DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import { useAuth } from "@/hooks/use-auth";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { RevealToggle } from "@/components/ui/reveal-toggle";
import { useViewport } from "@/hooks/use-viewport";
import { MobileDashboardPage } from "@/components/mobile/dashboard/MobileDashboardPage";
import { DateRangeFilter } from "@/components/dashboard/widgets/date-range-filter";
import { WidgetBoundary } from "@/components/dashboard/widget-boundary";
import { TodayStrip } from "@/components/dashboard/widgets/today-strip";
import { OrderPipeline } from "@/components/dashboard/widgets/order-pipeline";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { useLanguage } from "@/hooks/use-language";
import { useAnnouncements } from "@/hooks/use-announcements";
import { perfTrace } from "@/lib/perf-trace";
import { useDashboardMetricsQuery } from "@/hooks/use-dashboard-metrics-query";
import { diag } from "@/lib/diag";
import { DASHBOARD_EVENTS, useTrackEvent } from "@/lib/analytics/track-event";
import { buildDashboardCsv } from "@/lib/analytics/dashboard-export";

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
  const { data: serverMetrics, dataUpdatedAt: metricsUpdatedAt } = useDashboardMetricsQuery('all');
  const dashboardMetrics = serverMetrics ?? clientMetrics;
  // ENG-D1: the two engines can disagree (the client derives boundaries from the
  // browser clock). Falling back is fine — doing it silently is not, because the
  // numbers change with no way for the merchant to tell. Surface it.
  const usingLocalFallback = !serverMetrics && !!clientMetrics;
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
  const track = useTrackEvent();

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
      track(DASHBOARD_EVENTS.opened, { is_mobile: isMobile, used_local_fallback: !serverMetrics });
    }
  }, [isMounted, dashboardMetrics]);   // eslint-disable-line react-hooks/exhaustive-deps -- first paint only

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
  // Cycle time is a float; compare to the whole hour so float noise is not
  // reported as drift. A real timezone shift moves it by hours, not fractions.
  const roundOrNull = (n: number | null | undefined) =>
      typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !serverMetrics || !clientMetrics) return;
    const cmp: Array<[string, number | null, number | null]> = [
      ['pipeline.new', serverMetrics.pipeline.find(p => p.status === 'new')?.count ?? -1, clientMetrics.pipeline.find(p => p.status === 'new')?.count ?? -1],
      ['todayStrip.ordersToday', serverMetrics.todayStrip.ordersToday, clientMetrics.todayStrip.ordersToday],
      ['funnel.total', serverMetrics.funnel[0]?.value ?? -1, clientMetrics.funnel[0]?.value ?? -1],
      ['deliveryRate.current', serverMetrics.deliveryRate.currentRate, clientMetrics.deliveryRate.currentRate],
      ['monthForecast.ordersThisMonth', serverMetrics.monthForecast.ordersThisMonth, clientMetrics.monthForecast.ordersThisMonth],
      // Added after the COR-D3 timezone correction. Both of these read
      // delivered_at, and both disagreed with the client for days while every
      // sampled metric above stayed green: the SQL shifted delivery times by a
      // flat -6h, so today's revenue was understated by 59% and 383 sub-6h
      // deliveries were discarded as impossible. Sample the metrics that depend
      // on event timestamps, not just the ones keyed on created_at.
      ['monthForecast.revenueThisMonth', serverMetrics.monthForecast.revenueThisMonth, clientMetrics.monthForecast.revenueThisMonth],
      ['avgTimePerStage.avgHours', roundOrNull(serverMetrics.avgTimePerStage[0]?.avgHours), roundOrNull(clientMetrics.avgTimePerStage[0]?.avgHours)],
      ['avgTimePerStage.sampleSize', serverMetrics.avgTimePerStage[0]?.sampleSize ?? -1, clientMetrics.avgTimePerStage[0]?.sampleSize ?? -1],
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

  // DV-D1: the header's Today/7d/30d control used to re-scope exactly ONE widget
  // (the pipeline bar) while everything else silently kept showing all-time data.
  // Every widget whose question is range-dependent now reads from the ranged
  // query. Widgets with an inherent window — today's strip, the hourly bars, the
  // 7-day delivery rate, week-over-week, the month forecast, the live feed — keep
  // their own, and the work-queue counters stay current-state by design.
  const rangeScoped = rangeMetrics ?? dashboardMetrics;

  const handleStatCardClick = (status: 'new' | 'confirmed' | 'rejected') => {
    track(DASHBOARD_EVENTS.drilldownClicked, { source_widget: 'stats-grid', status });
    router.push(`/orders?status=${status}`);
  };

  const handlePipelineStageClick = (status: string) => {
    track(DASHBOARD_EVENTS.drilldownClicked, { source_widget: 'order-pipeline', status });
    router.push(`/orders?status=${status}`);
  };

  // DV-D2: every widget that shows a problem should be able to show the orders
  // behind it. The orders page reads these params on mount.
  // COM-D1: a merchant could read these numbers but never get them out.
  const handleExport = () => {
    const csv = buildDashboardCsv(rangeScoped, { range: dateRange, includeFinancials: canReveal });
    // \ufeff = BOM, so Excel opens the Arabic city and product names as UTF-8
    // instead of mojibake.
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-${dateRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    track(DASHBOARD_EVENTS.drilldownClicked, { source_widget: 'export', filters: dateRange });
  };

  const goToOrders = (params: Record<string, string>, sourceWidget: string) => {
    // Record WHICH widget drove the click, not the customer or city itself — a city
    // name is business data, and events stay free of record content (OBS-D1).
    track(DASHBOARD_EVENTS.drilldownClicked, { source_widget: sourceWidget, filters: Object.keys(params).join('+') });
    router.push(`/orders?${new URLSearchParams(params).toString()}`);
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
              <div className="inline-flex items-center gap-1.5 px-3 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm" title={showFinancials ? t("dashboard.financials.hideTitle") : t("dashboard.financials.showTitle")}>
                <RevealToggle size={18} />
                <span className="text-xs font-semibold text-muted-foreground select-none">
                  {showFinancials ? t("dashboard.financials.hide") : t("dashboard.financials.show")}
                </span>
              </div>
            )}
            <DateRangeFilter
              value={dateRange}
              onChange={(next) => {
                track(DASHBOARD_EVENTS.rangeChanged, { from: dateRange, to: next });
                setDateRange(next);
              }}
            />

            {/* DV-D2: the Search and Bell buttons that used to sit here had no
                onClick at all — dead controls in the page's prime real estate,
                duplicating the working GlobalSearch and NotificationsDropdown in
                the app shell's top bar. Removed rather than wired, so there is one
                search and one bell in the product, not two. */}

            <button
              onClick={handleExport}
              title={t("dashboard.export.title")}
              aria-label={t("dashboard.export.title")}
              className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm"
            >
              <Download className="w-5 h-5" />
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

        {/* ENG-D1: say so when these figures were computed locally. */}
        {usingLocalFallback && (
          <div className="pastel-card pastel-card-yellow px-4 py-3 flex items-center gap-2 text-sm text-amber-900">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span className="font-semibold">{t("dashboard.fallback.title")}</span>
            <span className="text-amber-900/70">{t("dashboard.fallback.detail")}</span>
          </div>
        )}

        {/* Today at a Glance */}
        <WidgetBoundary label="today-strip"><TodayStrip metrics={dashboardMetrics.todayStrip} /></WidgetBoundary>

        {/* Stats Grid */}
        <WidgetBoundary label="stats-grid"><StatsGrid stats={stats} onCardClick={handleStatCardClick} /></WidgetBoundary>

        {/* Order Pipeline */}
        <WidgetBoundary label="order-pipeline">
          <OrderPipeline
          stages={rangeMetrics?.pipeline ?? dashboardMetrics.pipeline}
          onStageClick={handlePipelineStageClick}
        />
        </WidgetBoundary>

        {/* Charts Row: Trend (7col) | Delivery Rate + Hourly (5col) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 min-h-[320px]">
            <WidgetBoundary label="revenue-trend"><RevenueTrendChart orders={orders} showRevenue={showFinancials} /></WidgetBoundary>
          </div>
          <div className="xl:col-span-5 flex flex-col gap-6">
            <WidgetBoundary label="delivery-rate"><DeliverySuccessRate metrics={dashboardMetrics.deliveryRate} /></WidgetBoundary>
            <WidgetBoundary label="orders-per-hour"><OrdersPerHour data={dashboardMetrics.ordersPerHour} /></WidgetBoundary>
          </div>
        </div>

        {/* Heatmap Row: Peak Hours (8col) | Avg Time Per Stage (4col) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 min-h-[280px]">
            <WidgetBoundary label="peak-heatmap"><PeakHoursHeatmap data={rangeScoped.peakHeatmap} /></WidgetBoundary>
          </div>
          <div className="xl:col-span-4 min-h-[280px]">
            <WidgetBoundary label="avg-time-per-stage"><AvgTimePerStage metrics={rangeScoped.avgTimePerStage} /></WidgetBoundary>
          </div>
        </div>

        {/* Intelligence Row: WoW | Forecast | Rejection */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-12 gap-6">
          <div className="md:col-span-1 xl:col-span-4 min-h-[240px]">
            <WidgetBoundary label="week-over-week"><WeekOverWeek metrics={dashboardMetrics.weekOverWeek} /></WidgetBoundary>
          </div>
          <div className="md:col-span-1 xl:col-span-4 min-h-[240px]">
            <WidgetBoundary label="month-forecast"><MonthForecast forecast={dashboardMetrics.monthForecast} /></WidgetBoundary>
          </div>
          <div className="md:col-span-1 xl:col-span-4 min-h-[240px]">
            <WidgetBoundary label="rejection-breakdown"><RejectionBreakdown
              cityRejectionStats={rangeScoped.urgency.cityRejectionStats}
              onCityClick={(city) => goToOrders({ status: 'rejected', city }, 'rejection-breakdown')}
            /></WidgetBoundary>
          </div>
        </div>

        {/* Map | Top Cities + Top Products (two tall columns to the right of the map) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-6 h-[400px] xl:h-[460px]">
            <WidgetBoundary label="iraq-map"><IraqMap orders={orders} /></WidgetBoundary>
          </div>
          <div className="xl:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6 xl:h-[460px]">
            <WidgetBoundary label="city-leaderboard"><Leaderboard
              cities={rangeScoped.enhancedLeaderboard.topCities}
              onCityClick={(city) => goToOrders({ city }, 'city-leaderboard')}
            /></WidgetBoundary>
            <WidgetBoundary label="product-leaderboard">
              <ProductLeaderboard
              products={rangeScoped.enhancedLeaderboard.topProductsEnhanced}
            />
            </WidgetBoundary>
          </div>
        </div>

        {/* Operational Row: Recent Orders | Staff Leaderboard (admin) | Announcements */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Recent Orders Feed */}
          <div className={`xl:col-span-5 h-[440px]`}>
            <WidgetBoundary label="recent-orders-feed">
              <RecentOrdersFeed
              orders={dashboardMetrics.recentOrders}
              updatedAt={serverMetrics ? metricsUpdatedAt : undefined}
            />
            </WidgetBoundary>
          </div>

          {/* Staff Leaderboard — admin only */}
          {isAdmin ? (
            <div className="xl:col-span-4 h-[440px]">
              <WidgetBoundary label="staff-leaderboard"><StaffLeaderboard staff={dashboardMetrics.staffLeaderboard} /></WidgetBoundary>
            </div>
          ) : (
            /* Non-admins: announcements takes more space */
            null
          )}

          {/* Team Announcements */}
          <div className={`${isAdmin ? 'xl:col-span-3' : 'xl:col-span-7'} h-[440px]`}>
            <WidgetBoundary label="team-announcements">
              <TeamAnnouncements
              announcements={announcements}
              isAdmin={isAdmin}
              loading={announcementsLoading}
              error={announcementsError}
              onCreate={createAnnouncement}
              onTogglePin={togglePin}
              onDelete={deleteAnnouncement}
            />
            </WidgetBoundary>
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
