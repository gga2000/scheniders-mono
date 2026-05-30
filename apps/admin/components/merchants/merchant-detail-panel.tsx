"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMerchantDetail } from "@/hooks/use-merchant-detail";
import { useAdminStore } from "@/store/use-admin-store";
import {
  Wallet,
  CreditCard,
  ShoppingBag,
  Users,
  X,
  Maximize2,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_CHROME } from "@/lib/animation-constants";
import { OverviewTab } from "./detail/overview-tab";
import { BillingTab } from "./detail/billing-tab";
import { UsageTab } from "./detail/usage-tab";
import { TeamTab } from "./detail/team-tab";
import { NotesTab } from "./detail/notes-tab";
import { TenantTimeline } from "./tenant-timeline";
import { OnboardingChecklist } from "./onboarding-checklist";
import { MerchantActionBar } from "./detail/merchant-action-bar";
import { CopyableText } from "@/components/shared/copyable-text";
import type { TenantStatus, PlanTier } from "@/types/admin";
import Link from "next/link";

const fmtCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-IQ").format(n);
};

const tabs = ["Overview", "Billing", "Usage", "Team", "Notes", "Timeline", "Onboarding"] as const;
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

const MIN_WIDTH = 400;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 560;

function PanelSkeleton() {
  return (
    <div className="p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-foreground/10" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-36 bg-foreground/10 rounded-lg" />
          <div className="h-3 w-24 bg-foreground/10 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-foreground/5" />
        ))}
      </div>
      <div className="h-9 bg-foreground/5 rounded-xl" />
      <div className="h-48 bg-foreground/5 rounded-2xl" />
    </div>
  );
}

export function MerchantDetailPanel() {
  const { activeDetailId, detailViewMode, setActiveDetailId } = useAdminStore();
  const { data, isLoading } = useMerchantDetail(activeDetailId ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [noteText, setNoteText] = useState("");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isOpen = !!activeDetailId && detailViewMode === "panel";

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveDetailId(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, setActiveDetailId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [panelWidth]);

  function handleClose() {
    setActiveDetailId(null);
    setActiveTab("Overview");
    setNoteText("");
  }

  function handleOpenFullscreen() {
    handleClose();
  }

  const merchantId = activeDetailId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="panel-backdrop"
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          <motion.div
            key="panel"
            ref={panelRef}
            className="fixed top-0 right-0 bottom-0 z-50 bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl flex flex-col"
            style={{ width: `min(${panelWidth}px, 100vw)` }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              duration: 0.3,
              ease: EASE_CHROME as unknown as number[],
            }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize group hover:bg-foreground/10 transition-colors z-10"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
              {isLoading || !data ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-foreground/10 animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-36 bg-foreground/10 animate-pulse rounded" />
                    <div className="h-3 w-24 bg-foreground/10 animate-pulse rounded" />
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl ring-1 ring-black/5 flex items-center justify-center text-white font-black text-base shrink-0"
                    style={{ backgroundColor: data.tenant.branding?.primary_color || "#1E1E1E" }}
                  >
                    {data.tenant.business_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CopyableText
                      value={data.tenant.business_name}
                      className="text-sm font-bold text-foreground"
                    />
                    <CopyableText
                      value={data.tenant.slug}
                      className="text-[11px] text-foreground/50 mt-0.5"
                    />
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.1em]",
                          statusStyles[data.tenant.status] ?? "bg-foreground/10 text-foreground/70"
                        )}
                      >
                        {data.tenant.status}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.1em]",
                          planStyles[data.tenant.plan] ?? "bg-foreground/10 text-foreground/70"
                        )}
                      >
                        {data.tenant.plan}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Link
                      href={`/merchants/${merchantId}`}
                      onClick={handleOpenFullscreen}
                      className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all"
                      title="Open fullscreen"
                      aria-label="Open fullscreen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={handleClose}
                      className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all"
                      aria-label="Close panel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading || !data ? (
                <PanelSkeleton />
              ) : (
                <PanelBody
                  data={data}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  noteText={noteText}
                  setNoteText={setNoteText}
                  merchantId={merchantId!}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PanelBody({
  data,
  activeTab,
  setActiveTab,
  noteText,
  setNoteText,
  merchantId,
}: {
  data: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  noteText: string;
  setNoteText: (v: string) => void;
  merchantId: string;
}) {
  const { tenant, wallet, subscription, transactions, usage, team, notes, orderCount } = data;

  return (
    <div className="p-4 space-y-4">
      <MerchantActionBar
        merchantId={merchantId}
        status={tenant.status as TenantStatus}
        plan={tenant.plan as PlanTier}
        walletBalance={wallet?.balance_iqd ?? 0}
      />

      <div className="grid grid-cols-2 gap-2">
        <HeroStat
          icon={Wallet}
          label="Balance"
          value={fmtCompact(wallet?.balance_iqd ?? 0)}
          unit="IQD"
          tone="emerald"
          onClick={() => setActiveTab("Billing")}
        />
        <HeroStat
          icon={CreditCard}
          label="Lifetime"
          value={fmtCompact(wallet?.total_charged_iqd ?? 0)}
          unit="IQD"
          tone="amber"
          onClick={() => setActiveTab("Billing")}
        />
        <HeroStat
          icon={ShoppingBag}
          label="Orders"
          value={fmtCompact(orderCount)}
          tone="sky"
          onClick={() => setActiveTab("Usage")}
        />
        <HeroStat
          icon={Users}
          label="Team"
          value={String(team.length)}
          tone="violet"
          onClick={() => setActiveTab("Team")}
        />
      </div>

      {(tenant.contact_email || tenant.contact_phone || tenant.address) && (
        <div className="rounded-2xl border border-[var(--card-border)] bg-foreground/[0.015] dark:bg-foreground/[0.02] p-3 space-y-1.5">
          {tenant.contact_email && (
            <div className="flex items-center gap-2 text-[11px]">
              <Mail className="w-3 h-3 text-foreground/40 shrink-0" />
              <CopyableText
                value={tenant.contact_email}
                className="text-foreground/75 font-medium min-w-0"
              />
            </div>
          )}
          {tenant.contact_phone && (
            <div className="flex items-center gap-2 text-[11px]">
              <Phone className="w-3 h-3 text-foreground/40 shrink-0" />
              <CopyableText
                value={tenant.contact_phone}
                className="text-foreground/75 font-medium tabular-nums min-w-0"
              />
            </div>
          )}
          {tenant.address && (
            <div className="flex items-center gap-2 text-[11px]">
              <MapPin className="w-3 h-3 text-foreground/40 shrink-0" />
              <CopyableText
                value={[tenant.address, tenant.city].filter(Boolean).join(", ")}
                className="text-foreground/75 font-medium min-w-0"
              />
            </div>
          )}
        </div>
      )}

      <div className="relative inline-flex p-1 rounded-2xl bg-foreground/[0.04] border border-foreground/[0.05] gap-0.5 overflow-x-auto scrollbar-hide max-w-full">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-colors z-10",
                isActive
                  ? "text-white dark:text-[#1E1E1E]"
                  : "text-foreground/55 hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="panelTabIndicator"
                  className="absolute inset-0 rounded-xl bg-[#1E1E1E] dark:bg-white shadow-sm shadow-black/20 dark:shadow-white/10"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{tab}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-[200px]">
        {activeTab === "Overview" && (
          <OverviewTab merchantId={tenant.id} tenant={tenant} subscription={subscription} />
        )}
        {activeTab === "Billing" && (
          <BillingTab wallet={wallet} transactions={transactions} />
        )}
        {activeTab === "Usage" && <UsageTab usage={usage} />}
        {activeTab === "Team" && <TeamTab team={team} merchantId={tenant.id} />}
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

const TONE_STYLES: Record<string, { icon: string; glow: string }> = {
  emerald: {
    icon: "text-emerald-500 dark:text-emerald-400",
    glow: "from-emerald-400/0 via-emerald-400/5 to-emerald-400/10",
  },
  amber: {
    icon: "text-amber-500 dark:text-amber-400",
    glow: "from-amber-400/0 via-amber-400/5 to-amber-400/10",
  },
  sky: {
    icon: "text-sky-500 dark:text-sky-400",
    glow: "from-sky-400/0 via-sky-400/5 to-sky-400/10",
  },
  violet: {
    icon: "text-violet-500 dark:text-violet-400",
    glow: "from-violet-400/0 via-violet-400/5 to-violet-400/10",
  },
};

function HeroStat({
  icon: Icon,
  label,
  value,
  unit,
  tone,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit?: string;
  tone: keyof typeof TONE_STYLES;
  onClick?: () => void;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-2.5 text-left hover:border-foreground/15 hover:shadow-sm transition-all"
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity",
          styles?.glow
        )}
      />
      <div className="relative flex items-center gap-1.5 mb-1">
        <Icon className={cn("w-3 h-3", styles?.icon)} />
        <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
          {label}
        </span>
      </div>
      <div className="relative flex items-baseline gap-1">
        <span className="text-lg font-black tabular-nums text-foreground leading-none">
          {value}
        </span>
        {unit && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-foreground/40">
            {unit}
          </span>
        )}
      </div>
    </button>
  );
}
