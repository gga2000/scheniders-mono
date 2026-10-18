"use client";

import { motion } from "framer-motion";
import { useDashboardV2 } from "@/hooks/use-dashboard-v2";
import { SPRING_CARD, STAGGER_CHILDREN, DELAY_CHILDREN } from "@/lib/animation-constants";
import { KpiGridV2 } from "@/components/dashboard/kpi-grid-v2";
import { PlatformOrderStats } from "@/components/dashboard/platform-order-stats";
import { TopMerchants } from "@/components/dashboard/top-merchants";
import { OrderPipeline } from "@/components/dashboard/order-pipeline";
import { GrowthMetrics } from "@/components/dashboard/growth-metrics";
import { IraqHeatmap } from "@/components/dashboard/iraq-heatmap";
import { RevenueBreakdown } from "@/components/dashboard/revenue-breakdown";
import { FulfillmentFunnel } from "@/components/dashboard/fulfillment-funnel";
import { PeakHours } from "@/components/dashboard/peak-hours";
import { WalletHealth } from "@/components/dashboard/wallet-health";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { PlanMovementWidget } from "@/components/dashboard/plan-movement";
import { OnboardingTracker } from "@/components/dashboard/onboarding-tracker";
import { TimeToFirstOrder } from "@/components/dashboard/time-to-first-order";
import { MerchantLTV } from "@/components/dashboard/merchant-ltv";
import { TopUpPatterns } from "@/components/dashboard/topup-patterns";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { MerchantWatchlistWidget } from "@/components/merchants/merchant-watchlist-widget";
import { Loader2 } from "lucide-react";
import { SeedAutomationToggle } from "@/components/dashboard/seed-automation-toggle";

const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: STAGGER_CHILDREN,
      delayChildren: DELAY_CHILDREN,
    },
  },
};

const staggerItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: SPRING_CARD },
};

export default function CommandCenterPage() {
  const {
    isLoading,
    kpis,
    platformStats,
    pipeline,
    topMerchants,
    geoStats,
    funnel,
    growth,
    walletHealth,
    peakHours,
    activityHeatmap,
    revenueBreakdown,
    planMovements,
    onboarding,
    timeToFirstOrder,
    merchantLTV,
    topUpPatterns,
    data,
  } = useDashboardV2();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
          <p className="text-foreground-muted mt-1">
            Platform overview and key metrics
          </p>
        </div>
        <SeedAutomationToggle />
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-6"
      >
        {/* Row 1: KPI Cards (full width) */}
        <motion.div variants={staggerItem}>
          <KpiGridV2 kpis={kpis} />
        </motion.div>

        {/* Row 2: Platform Order Stats (full width) */}
        <motion.div variants={staggerItem}>
          <PlatformOrderStats stats={platformStats} />
        </motion.div>

        {/* Row 3: Leaderboard + Pipeline + Growth (3 cols) */}
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"
        >
          <TopMerchants merchants={topMerchants} />
          <OrderPipeline pipeline={pipeline} />
          <GrowthMetrics growth={growth} />
        </motion.div>

        {/* Row 4: Iraq Map + Revenue Breakdown (2 cols) */}
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
        >
          <IraqHeatmap geoStats={geoStats} />
          <RevenueBreakdown breakdown={revenueBreakdown} />
        </motion.div>

        {/* Row 5: Funnel + Peak Hours + Wallet Health (3 cols) */}
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"
        >
          <FulfillmentFunnel funnel={funnel} />
          <PeakHours cells={peakHours} />
          <WalletHealth health={walletHealth} />
        </motion.div>

        {/* Row 6: Activity Heatmap + Plan Movement */}
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"
        >
          <div className="lg:col-span-2">
            <ActivityHeatmap days={activityHeatmap} />
          </div>
          <PlanMovementWidget movements={planMovements} />
        </motion.div>

        {/* Row 7: Onboarding Tracker + Time to First Order */}
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"
        >
          <div className="lg:col-span-2">
            <OnboardingTracker tenants={onboarding} />
          </div>
          <TimeToFirstOrder buckets={timeToFirstOrder} />
        </motion.div>

        {/* Row 8: Merchant LTV + Top-Up Patterns */}
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
        >
          <MerchantLTV data={merchantLTV} />
          <TopUpPatterns patterns={topUpPatterns} />
        </motion.div>

        {/* Row 9: Activity Feed + Watchlist */}
        <motion.div
          variants={staggerItem}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"
        >
          <div className="lg:col-span-2">
          <ActivityFeed
            activities={
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((data as any)?.recentActivity ?? []) as Array<{
                id: string;
                admin_user_id: string | null;
                admin_label: string | null;
                actor_email: string | null;
                action: string;
                details: Record<string, unknown> | null;
                tenant_id: string | null;
                created_at: string;
              }>
            }
            isLoading={false}
          />
          </div>
          <MerchantWatchlistWidget />
        </motion.div>
      </motion.div>
    </div>
  );
}
