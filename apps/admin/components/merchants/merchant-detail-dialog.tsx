"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMerchantDetail, type MerchantDetail } from "@/hooks/use-merchant-detail";
import { useAdminStore } from "@/store/use-admin-store";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@scheniders/ui/dialog";
import {
  Wallet,
  TrendingUp,
  Coins,
  ShoppingBag,
  Users,
  PanelRight,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OverviewTab } from "./detail/overview-tab";
import { BillingTab } from "./detail/billing-tab";
import { UsageTab } from "./detail/usage-tab";
import { TeamTab } from "./detail/team-tab";
import { NotesTab } from "./detail/notes-tab";
import { MerchantActionBar } from "./detail/merchant-action-bar";
import { CopyableText } from "@/components/shared/copyable-text";
import { HealthScoreTooltip } from "./health-score-tooltip";
import { MerchantAlertFlag } from "./merchant-alert-flag";
import { DialogStatCard } from "./detail/dialog-stat-card";
import { DialogQuickActions } from "./detail/dialog-quick-actions";
import { PinnedNoteStrip } from "./detail/pinned-note-strip";
import { LimitedBanner } from "./detail/limited-banner";
import { PlanUtilizationBars } from "./detail/plan-utilization-bars";
import { RecentOrdersSection } from "./detail/recent-orders-section";
import { AuditLogTab } from "./detail/audit-log-tab";
import { LastActorBadge } from "./last-actor-badge";
import { useLastActor } from "@/hooks/use-last-actors";
import type { TenantStatus, PlanTier, AdminTenant, TenantRestrictions } from "@/types/admin";
import { TenantTimeline } from "./tenant-timeline";
import { OnboardingChecklist } from "./onboarding-checklist";
import Link from "next/link";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const tabs = ["Overview", "Billing", "Usage", "Team", "Notes", "Timeline", "Audit", "Onboarding"] as const;
type Tab = (typeof tabs)[number];

const statusStyles: Record<string, string> = {
  active:
    "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20",
  trial:
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20",
  limited:
    "bg-gradient-to-br from-amber-300 to-yellow-500 text-white shadow-sm shadow-amber-400/30 ring-1 ring-white/20",
  suspended:
    "bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm shadow-rose-500/40 ring-1 ring-white/20",
  cancelled:
    "bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm shadow-slate-500/20 ring-1 ring-white/20",
};

const planStyles: Record<string, string> = {
  free: "bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm shadow-slate-500/20 ring-1 ring-white/20",
  starter:
    "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shadow-sky-500/30 ring-1 ring-white/20",
  growth:
    "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20",
  professional:
    "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
  enterprise:
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20",
};

// ── Skeleton for loading state ──────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-foreground/10" />
        <div className="space-y-2 flex-1">
          <div className="h-5 w-48 bg-foreground/10 rounded-lg" />
          <div className="h-3 w-32 bg-foreground/10 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-foreground/5" />
        ))}
      </div>
      <div className="h-10 bg-foreground/5 rounded-xl" />
      <div className="h-64 bg-foreground/5 rounded-2xl" />
    </div>
  );
}

export function MerchantDetailDialog() {
  const { activeDetailId, setActiveDetailId, setDetailViewMode } = useAdminStore();
  const { data, isLoading } = useMerchantDetail(activeDetailId ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [noteText, setNoteText] = useState("");

  const isOpen = !!activeDetailId;

  function handleClose() {
    setActiveDetailId(null);
    setActiveTab("Overview");
    setNoteText("");
  }

  function handleOpenPanel() {
    setDetailViewMode("panel");
  }

  function handleOpenFullscreen() {
    handleClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="md:max-w-4xl"
        aria-describedby={undefined}
      >
        {isLoading || !data ? (
          <>
            <DialogTitle className="sr-only">Loading merchant details</DialogTitle>
            <DetailSkeleton />
          </>
        ) : (
          <DialogBody
            data={data}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            noteText={noteText}
            setNoteText={setNoteText}
            onOpenPanel={handleOpenPanel}
            onOpenFullscreen={handleOpenFullscreen}
            merchantId={activeDetailId!}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Adapters & helpers ──────────────────────────────────────────────────

function buildAdminTenantShape(data: MerchantDetail): AdminTenant {
  const totalOrders = data.usage.reduce((sum, u) => sum + (u.orders_count ?? 0), 0);
  const teamCount = data.team.length;
  const status = data.tenant.status as TenantStatus;
  return {
    id: data.tenant.id,
    business_name: data.tenant.business_name,
    slug: data.tenant.slug,
    plan: data.tenant.plan as PlanTier,
    status,
    trial_ends_at: data.tenant.trial_ends_at,
    branding: {
      logo_url: data.tenant.branding?.logo_url ?? null,
      primary_color: data.tenant.branding?.primary_color ?? "#1E1E1E",
      secondary_color: data.tenant.branding?.secondary_color ?? "#1E1E1E",
    },
    settings: {
      timezone: "Asia/Baghdad",
      language: "en",
      currency: "IQD",
    },
    contact_email: data.tenant.contact_email,
    contact_phone: data.tenant.contact_phone,
    address: data.tenant.address,
    city: data.tenant.city,
    created_at: data.tenant.created_at,
    is_prospect: data.tenant.is_prospect,
    prospect_lead_id: data.tenant.prospect_lead_id ?? null,
    tags: [],
    last_active_at: null,
    monthly_revenue: data.wallet?.total_charged_iqd ?? 0,
    // No daily breakdown available in MerchantDetail's wallet/usage payload;
    // fall back to 0 so the AdminTenant contract is satisfied. The list-view
    // adapter computes this from a different source.
    daily_revenue: 0,
    order_sparkline: data.usage.map((u) => u.orders_count ?? 0),
    wallet: data.wallet ?? undefined,
    usage: {
      orders_count: totalOrders,
      orders_charged: data.usage.reduce((s, u) => s + (u.orders_charged ?? 0), 0),
      team_members_count: teamCount,
    },
  } satisfies AdminTenant;
}

function calculateHealthScore(t: AdminTenant): number {
  let score = 50;
  if (t.status === "active") score += 15;
  else if (t.status === "trial") score += 5;
  else if (t.status === "suspended") score -= 20;
  const balance = t.wallet?.balance_iqd ?? 0;
  if (balance > 50000) score += 15;
  else if (balance > 10000) score += 5;
  else score -= 10;
  const orders = t.usage?.orders_count ?? 0;
  if (orders > 50) score += 15;
  else if (orders > 10) score += 10;
  else if (orders > 0) score += 5;
  if (t.plan === "enterprise") score += 5;
  else if (t.plan === "professional") score += 3;
  return Math.max(0, Math.min(100, score));
}

function isChurnRisk(t: AdminTenant): boolean {
  const balance = t.wallet?.balance_iqd ?? 0;
  const orders = t.usage?.orders_count ?? 0;
  if (t.status === "suspended") return true;
  if (balance < 5000 && orders < 5) return true;
  if (t.status === "trial" && t.trial_ends_at) {
    const days = Math.ceil(
      (new Date(t.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (days <= 3 && orders === 0) return true;
  }
  return false;
}

function buildOrderSparkline(usage: MerchantDetail["usage"]): number[] {
  return [...usage]
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .map((u) => u.orders_count ?? 0)
    .slice(-12);
}

function buildChargeSparkline(usage: MerchantDetail["usage"]): number[] {
  return [...usage]
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .map((u) => u.orders_charged ?? 0)
    .slice(-12);
}

function buildBalanceSparkline(transactions: MerchantDetail["transactions"]): number[] {
  if (!transactions.length) return [];
  return [...transactions]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((t) => t.balance_after_iqd)
    .slice(-12);
}

function pctDelta(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const last = arr[arr.length - 1] ?? 0;
  const prev = arr[arr.length - 2] ?? 0;
  if (prev === 0) return last === 0 ? 0 : 100;
  return ((last - prev) / Math.abs(prev)) * 100;
}

// ── Dialog Body ─────────────────────────────────────────────────────────

function DialogBody({
  data,
  activeTab,
  setActiveTab,
  noteText,
  setNoteText,
  onOpenPanel,
  onOpenFullscreen,
  merchantId,
}: {
  data: MerchantDetail;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  noteText: string;
  setNoteText: (v: string) => void;
  onOpenPanel: () => void;
  onOpenFullscreen: () => void;
  merchantId: string;
}) {
  const { tenant, wallet, subscription, transactions, usage, team, notes, orderCount, planLimits } =
    data;
  const primaryColor = tenant.branding?.primary_color || "#1E1E1E";

  const adapterTenant = useMemo(() => buildAdminTenantShape(data), [data]);
  const healthScore = useMemo(() => calculateHealthScore(adapterTenant), [adapterTenant]);
  const churnRisk = useMemo(() => isChurnRisk(adapterTenant), [adapterTenant]);

  const orderSpark = useMemo(() => buildOrderSparkline(usage), [usage]);
  const chargeSpark = useMemo(() => buildChargeSparkline(usage), [usage]);
  const balanceSpark = useMemo(() => buildBalanceSparkline(transactions), [transactions]);

  const orderDelta = useMemo(() => pctDelta(orderSpark), [orderSpark]);
  const chargeDelta = useMemo(() => pctDelta(chargeSpark), [chargeSpark]);
  const balanceDelta = useMemo(() => pctDelta(balanceSpark), [balanceSpark]);

  // MRR: only when subscription is active and we have plan pricing.
  const mrr = useMemo(() => {
    if (!subscription || subscription.status !== "active") return 0;
    return planLimits?.base_price_iqd ?? 0;
  }, [subscription, planLimits]);
  const ltv = wallet?.total_charged_iqd ?? 0;

  const isLimited = tenant.status === "limited";
  const restrictions = (tenant.restrictions ?? null) as TenantRestrictions | null;
  const { actor: lastActor } = useLastActor(tenant.id);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            {tenant.business_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-xl font-bold text-foreground truncate">
              <CopyableText
                value={tenant.business_name}
                className="text-xl font-bold text-foreground"
              />
            </DialogTitle>
            <CopyableText
              value={tenant.slug}
              className="text-sm text-foreground/50"
            />
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  statusStyles[tenant.status] ?? "bg-foreground/10 text-foreground/70"
                }`}
              >
                {tenant.status}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  planStyles[tenant.plan] ?? "bg-foreground/10 text-foreground/70"
                }`}
              >
                {tenant.plan}
              </span>
              <HealthScoreTooltip
                merchant={adapterTenant}
                score={healthScore}
                isChurnRisk={churnRisk}
              />
              <MerchantAlertFlag merchant={adapterTenant} />
              {lastActor && (
                <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-foreground/[0.04]">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/45 ml-1">
                    Last:
                  </span>
                  <LastActorBadge actor={lastActor} size="xs" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <DialogQuickActions
            contactPhone={tenant.contact_phone}
            contactEmail={tenant.contact_email}
            slug={tenant.slug}
            businessName={tenant.business_name}
          />
          <button
            onClick={onOpenPanel}
            className="p-2 rounded-xl text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all"
            title="Open in sidebar"
            aria-label="Open in sidebar panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
          <Link
            href={
              activeTab === "Overview"
                ? `/merchants/${merchantId}`
                : `/merchants/${merchantId}?tab=${activeTab}`
            }
            onClick={onOpenFullscreen}
            className="p-2 rounded-xl text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all"
            title="Open fullscreen"
            aria-label="Open fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* ── Limited banner ─────────────────────────────────────────── */}
      {isLimited && <LimitedBanner merchantId={merchantId} restrictions={restrictions} />}

      {/* ── Pinned note strip ──────────────────────────────────────── */}
      <PinnedNoteStrip notes={notes} onOpenNotes={() => setActiveTab("Notes")} />

      {/* ── Action bar ─────────────────────────────────────────────── */}
      <MerchantActionBar
        merchantId={merchantId}
        status={tenant.status as TenantStatus}
        plan={tenant.plan as PlanTier}
        walletBalance={wallet?.balance_iqd ?? 0}
      />

      {/* ── Quick Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <DialogStatCard
          icon={Wallet}
          label="Balance"
          value={fmt(wallet?.balance_iqd ?? 0)}
          unit="IQD"
          tone="green"
          spark={balanceSpark}
          delta={balanceDelta !== null ? { value: balanceDelta } : null}
          onClick={() => setActiveTab("Billing")}
          title="View billing & wallet history"
        />
        <DialogStatCard
          icon={TrendingUp}
          label="MRR"
          value={fmt(mrr)}
          unit="IQD"
          tone="rose"
          onClick={() => setActiveTab("Billing")}
          title={
            subscription?.status === "active"
              ? "Monthly recurring revenue from active subscription"
              : "No active subscription — MRR is 0"
          }
        />
        <DialogStatCard
          icon={Coins}
          label="LTV"
          value={fmt(ltv)}
          unit="IQD"
          tone="amber"
          spark={chargeSpark}
          delta={chargeDelta !== null ? { value: chargeDelta } : null}
          onClick={() => setActiveTab("Billing")}
          title="Lifetime billed amount"
        />
        <DialogStatCard
          icon={ShoppingBag}
          label="Orders"
          value={fmt(orderCount)}
          tone="blue"
          spark={orderSpark}
          delta={orderDelta !== null ? { value: orderDelta } : null}
          onClick={() => setActiveTab("Usage")}
          title="View usage & order history"
        />
        <DialogStatCard
          icon={Users}
          label="Team"
          value={String(team.length)}
          tone="purple"
          onClick={() => setActiveTab("Team")}
          title="View team members"
        />
      </div>

      {/* ── Plan utilization + recent orders ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PlanUtilizationBars
          planLimits={planLimits}
          usage={usage}
          team={team}
          plan={tenant.plan}
        />
        <RecentOrdersSection merchantId={merchantId} limit={5} />
      </div>

      {/* ── Tab Navigation: segmented pill ─────────────────────────── */}
      <div className="relative inline-flex p-1 rounded-2xl bg-foreground/[0.04] border border-foreground/[0.05] gap-0.5 overflow-x-auto scrollbar-hide max-w-full">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors z-10",
                isActive
                  ? "text-white dark:text-[#1E1E1E]"
                  : "text-foreground/55 hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="dialogTabIndicator"
                  className="absolute inset-0 rounded-xl bg-[#1E1E1E] dark:bg-white shadow-sm shadow-black/20 dark:shadow-white/10"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{tab}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <div className="min-h-[300px]">
        {activeTab === "Overview" && (
          <OverviewTab merchantId={merchantId} tenant={tenant} subscription={subscription} />
        )}
        {activeTab === "Billing" && (
          <BillingTab wallet={wallet} transactions={transactions} />
        )}
        {activeTab === "Usage" && <UsageTab usage={usage} />}
        {activeTab === "Team" && <TeamTab team={team} merchantId={merchantId} />}
        {activeTab === "Notes" && (
          <NotesTab notes={notes} noteText={noteText} setNoteText={setNoteText} />
        )}
        {activeTab === "Timeline" && (
          <TenantTimeline
            transactions={transactions}
            notes={notes}
            orderCount={orderCount}
            tenant={tenant}
          />
        )}
        {activeTab === "Audit" && <AuditLogTab merchantId={merchantId} />}
        {activeTab === "Onboarding" && (
          <OnboardingChecklist
            tenant={tenant}
            orderCount={orderCount}
            teamCount={team.length}
            walletBalance={wallet?.balance_iqd ?? 0}
            hasStorefront={!!(tenant.store_config && Object.keys(tenant.store_config).length > 0)}
            hasCustomDomain={false}
          />
        )}
      </div>
    </div>
  );
}
