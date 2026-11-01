"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { CreateOrderModal } from "@/components/orders/create-order-modal";
import { useOrderCrud } from "@/hooks/use-order-crud";
import { useOrdersAggregates } from "@/hooks/use-orders-aggregates";
import { Plus, Download } from "lucide-react";
import { baghdadHour, type DateRangeKey } from "@/lib/analytics/dashboard-calculations";
import { workQueueFromStatusCounts } from "@/lib/analytics/dashboard-work-queue";
import { useGeoFacts } from "@/hooks/use-dashboard-order-facts";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { useAuth } from "@/hooks/use-auth";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { RevealToggle } from "@/components/ui/reveal-toggle";
import { useViewport } from "@/hooks/use-viewport";
import { MobileDashboardPage } from "@/components/mobile/dashboard/MobileDashboardPage";
import { DateRangeFilter } from "@/components/dashboard/widgets/date-range-filter";
import { WidgetBoundary } from "@/components/dashboard/widget-boundary";
import { TodayStrip } from "@/components/dashboard/widgets/today-strip";
import { BuildStoreBanner } from "@/components/dashboard/build-store-banner";
import { OrderPipeline } from "@/components/dashboard/widgets/order-pipeline";
import { PageSkeleton } from "@scheniders/ui/skeletons";
import { useLanguage } from "@/hooks/use-language";
import { useAnnouncements } from "@/hooks/use-announcements";
import { perfTrace } from "@/lib/perf-trace";
import { useDashboardMetricsQuery } from "@/hooks/use-dashboard-metrics-query";
import { DASHBOARD_EVENTS, useTrackEvent } from "@/lib/analytics/track-event";
import { buildDashboardCsv } from "@/lib/analytics/dashboard-export";

// Dynamic imports — all chart + operational widgets
const IraqMap = dynamic(() => import("@/components/shared/iraq-map").then(mod => ({ default: mod.IraqMap })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const DeliverySuccessRate = dynamic(() => import("@/components/dashboard/widgets/delivery-success-rate").then(mod => ({ default: mod.DeliverySuccessRate })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const PeakHoursHeatmap = dynamic(() => import("@/components/dashboard/widgets/peak-hours-heatmap").then(mod => ({ default: mod.PeakHoursHeatmap })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const AvgTimePerStage = dynamic(() => import("@/components/dashboard/widgets/avg-time-per-stage").then(mod => ({ default: mod.AvgTimePerStage })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const WeekOverWeek = dynamic(() => import("@/components/dashboard/widgets/week-over-week").then(mod => ({ default: mod.WeekOverWeek })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const MonthForecast = dynamic(() => import("@/components/dashboard/widgets/month-forecast").then(mod => ({ default: mod.MonthForecast })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const RejectionBreakdown = dynamic(() => import("@/components/dashboard/widgets/rejection-breakdown").then(mod => ({ default: mod.RejectionBreakdown })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const ProductLeaderboard = dynamic(() => import("@/components/dashboard/widgets/product-leaderboard").then(mod => ({ default: mod.ProductLeaderboard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const RecentOrdersFeed = dynamic(() => import("@/components/dashboard/widgets/recent-orders-feed").then(mod => ({ default: mod.RecentOrdersFeed })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const StaffLeaderboard = dynamic(() => import("@/components/dashboard/widgets/staff-leaderboard").then(mod => ({ default: mod.StaffLeaderboard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const RevenueCard = dynamic(() => import("@/components/dashboard/bento/revenue-card").then(mod => ({ default: mod.RevenueCard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const OrderWavesCard = dynamic(() => import("@/components/dashboard/bento/order-waves-card").then(mod => ({ default: mod.OrderWavesCard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const GovernorateCard = dynamic(() => import("@/components/dashboard/bento/governorate-card").then(mod => ({ default: mod.GovernorateCard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const SeasonalityCard = dynamic(() => import("@/components/dashboard/bento/seasonality-card").then(mod => ({ default: mod.SeasonalityCard })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });
const TeamAnnouncements = dynamic(() => import("@/components/dashboard/widgets/team-announcements").then(mod => ({ default: mod.TeamAnnouncements })), { ssr: false, loading: () => <div className="h-full bg-[var(--card-bg)] rounded-3xl animate-pulse" /> });

export default function Home() {
  // Creating an order needs no loaded book; the dashboard does not mount one.
  const { createOrder } = useOrderCrud();
  // ORD-2: every number on this page comes from the server. The orders list is a
  // window of the book (and loads on its own schedule), so nothing here reads it:
  // first paint waits for get_dashboard_metrics alone, behind a skeleton, and a
  // failed load says so instead of falling back to window-sized numbers that
  // jump when the RPC lands.
  const metricsQuery = useDashboardMetricsQuery('all');
  const dashboardMetrics = metricsQuery.data;
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
      track(DASHBOARD_EVENTS.opened, { is_mobile: isMobile });
    }
  }, [isMounted, dashboardMetrics]);   // eslint-disable-line react-hooks/exhaustive-deps -- first paint only

  // OBS-D1: a metrics failure a merchant sees is recorded, once per failure.
  const metricsFailedAt = metricsQuery.errorUpdatedAt;
  useEffect(() => {
    if (metricsFailedAt) track(DASHBOARD_EVENTS.metricsFailed, { is_mobile: isMobile });
  }, [metricsFailedAt]);   // eslint-disable-line react-hooks/exhaustive-deps -- once per failure

  // DV-D1: the header's Today/7d/30d control re-scopes every widget whose question
  // is range-dependent. Widgets with an inherent window — today's strip, the
  // hourly bars, the 7-day delivery rate, week-over-week, the month forecast, the
  // live feed — read the unranged query, and the work-queue counters stay
  // current-state by design. Until the ranged figures arrive, ranged widgets show
  // a placeholder: the previous range's numbers under the new label would be false.
  const rangeQuery = useDashboardMetricsQuery(dateRange);
  const rangeScoped = rangeQuery.data;
  const geoFacts = useGeoFacts(dateRange);

  const aggregatesQuery = useOrdersAggregates({});
  const workQueue = useMemo(
    () => aggregatesQuery.data ? workQueueFromStatusCounts(aggregatesQuery.data.status_counts) : undefined,
    [aggregatesQuery.data],
  );

  if (isMounted && isMobile) {
    return <MobileDashboardPage />;
  }

  if (!isMounted || (!dashboardMetrics && !metricsQuery.isError)) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <PageSkeleton />
      </div>
    );
  }

  if (!dashboardMetrics) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="pastel-card pastel-card-pink p-8 max-w-md text-center space-y-3" role="alert">
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

  // The greeting follows Baghdad's clock, like every other boundary on the page.
  const getGreeting = () => {
    const hour = baghdadHour(new Date());
    if (hour < 12) return t("dashboard.greeting.morning");
    if (hour < 18) return t("dashboard.greeting.afternoon");
    return t("dashboard.greeting.evening");
  };

  const rangePlaceholder = rangeQuery.isError
    ? <WidgetLoadError onRetry={() => void rangeQuery.refetch()} />
    : <WidgetPending />;

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
    if (!rangeScoped) return;
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
              disabled={!rangeScoped}
              title={t("dashboard.export.title")}
              aria-label={t("dashboard.export.title")}
              className="w-12 h-12 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-foreground hover:bg-[var(--background)] transition-all shadow-sm disabled:opacity-50"
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

        {/* S3-02c: store-less tenants get one visible route to the builder */}
        <BuildStoreBanner />

        {/* Today at a Glance */}
        <WidgetBoundary label="today-strip"><TodayStrip metrics={dashboardMetrics.todayStrip} /></WidgetBoundary>

        {/* Stats Grid */}
        <WidgetBoundary label="stats-grid">
          {workQueue ? (
            <StatsGrid stats={workQueue} onCardClick={handleStatCardClick} />
          ) : aggregatesQuery.isError ? (
            <WidgetLoadError onRetry={() => void aggregatesQuery.refetch()} className="min-h-[140px]" />
          ) : (
            <WidgetPending className="min-h-[140px]" />
          )}
        </WidgetBoundary>

        {/* Order Pipeline */}
        <WidgetBoundary label="order-pipeline">
          {rangeScoped ? (
            <OrderPipeline stages={rangeScoped.pipeline} onStageClick={handlePipelineStageClick} />
          ) : rangePlaceholder}
        </WidgetBoundary>

        {/* Bento Row: how much (revenue / orders over time) | when (orders by hour).
            Both cards carry their own window and read one shared 60-day facts query. */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 min-h-[400px]">
            <WidgetBoundary label="bento-revenue"><RevenueCard /></WidgetBoundary>
          </div>
          <div className="xl:col-span-7 min-h-[400px]">
            <WidgetBoundary label="bento-order-waves"><OrderWavesCard /></WidgetBoundary>
          </div>
        </div>

        {/* Timing Row: Peak Hours (8col) | Delivery Rate over Avg Time Per Stage (4col) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 min-h-[280px]">
            <WidgetBoundary label="peak-heatmap">{rangeScoped ? <PeakHoursHeatmap data={rangeScoped.peakHeatmap} /> : rangePlaceholder}</WidgetBoundary>
          </div>
          <div className="xl:col-span-4 flex flex-col gap-6">
            <WidgetBoundary label="delivery-rate"><DeliverySuccessRate metrics={dashboardMetrics.deliveryRate} /></WidgetBoundary>
            <div className="flex-1 min-h-[280px]">
              <WidgetBoundary label="avg-time-per-stage">{rangeScoped ? <AvgTimePerStage metrics={rangeScoped.avgTimePerStage} /> : rangePlaceholder}</WidgetBoundary>
            </div>
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
            <WidgetBoundary label="rejection-breakdown">{rangeScoped ? (
              <RejectionBreakdown
                cityRejectionStats={rangeScoped.urgency.cityRejectionStats}
                onCityClick={(city) => goToOrders({ status: 'rejected', city }, 'rejection-breakdown')}
              />
            ) : rangePlaceholder}</WidgetBoundary>
          </div>
        </div>

        {/* Bento Row: where orders come from (governorates) | the shape of the year */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7">
            <WidgetBoundary label="bento-governorates"><GovernorateCard /></WidgetBoundary>
          </div>
          <div className="xl:col-span-5">
            <WidgetBoundary label="bento-seasonality"><SeasonalityCard /></WidgetBoundary>
          </div>
        </div>

        {/* Map (header range) | Top Products */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 h-[400px] xl:h-[460px]">
            <WidgetBoundary label="iraq-map">{geoFacts.data ? (
              <IraqMap orders={geoFacts.data} />
            ) : geoFacts.isError ? (
              <WidgetLoadError onRetry={() => void geoFacts.refetch()} />
            ) : (
              <WidgetPending />
            )}</WidgetBoundary>
          </div>
          <div className="xl:col-span-5 xl:h-[460px]">
            <WidgetBoundary label="product-leaderboard">{rangeScoped ? (
              <ProductLeaderboard
                products={rangeScoped.enhancedLeaderboard.topProductsEnhanced}
                onProductClick={(product) => goToOrders({ product }, 'product-leaderboard')}
              />
            ) : rangePlaceholder}</WidgetBoundary>
          </div>
        </div>

        {/* Operational Row: Recent Orders | Staff Leaderboard (admin) | Announcements */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Recent Orders Feed */}
          <div className={`xl:col-span-5 h-[440px]`}>
            <WidgetBoundary label="recent-orders-feed">
              <RecentOrdersFeed
              orders={dashboardMetrics.recentOrders}
              updatedAt={metricsQuery.dataUpdatedAt}
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
