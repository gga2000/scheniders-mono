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
  UserCircle,
  Loader2,
  X,
  Maximize2,
  GripVertical,
} from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { OverviewTab } from "./detail/overview-tab";
import { BillingTab } from "./detail/billing-tab";
import { UsageTab } from "./detail/usage-tab";
import { TeamTab } from "./detail/team-tab";
import { NotesTab } from "./detail/notes-tab";
import { TenantTimeline } from "./tenant-timeline";
import { OnboardingChecklist } from "./onboarding-checklist";
import Link from "next/link";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const tabs = ["Overview", "Billing", "Usage", "Team", "Notes", "Timeline", "Onboarding"] as const;
type Tab = (typeof tabs)[number];

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  trial: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const planStyles: Record<string, string> = {
  free: "bg-gray-100 text-gray-700",
  starter: "bg-blue-100 text-blue-800",
  growth: "bg-purple-100 text-purple-800",
  professional: "bg-purple-100 text-purple-800",
  enterprise: "bg-amber-100 text-amber-800",
};

const MIN_WIDTH = 400;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 520;

// ── Skeleton ────────────────────────────────────────────────────────────
function PanelSkeleton() {
  return (
    <div className="p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-foreground/10" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-36 bg-foreground/10 rounded-lg" />
          <div className="h-3 w-24 bg-foreground/10 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-foreground/5" />
        ))}
      </div>
      <div className="h-8 bg-foreground/5 rounded-lg" />
      <div className="h-48 bg-foreground/5 rounded-xl" />
    </div>
  );
}

export function MerchantDetailPanel() {
  const { activeDetailId, detailViewMode, setActiveDetailId, setDetailViewMode } = useAdminStore();
  const { data, isLoading } = useMerchantDetail(activeDetailId ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [noteText, setNoteText] = useState("");
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const isDragging = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isOpen = !!activeDetailId && detailViewMode === "panel";

  // ── Close on Escape ───────────────────────────────────────────────────
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

  // ── Resize drag handler ───────────────────────────────────────────────
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
          {/* Backdrop */}
          <motion.div
            key="panel-backdrop"
            className="fixed inset-0 z-40 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* Panel */}
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
            {/* Resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize group hover:bg-foreground/10 transition-colors z-10"
              onMouseDown={handleMouseDown}
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* ── Sticky Header ──────────────────────────────────────── */}
            <div className="shrink-0 p-4 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
              {isLoading || !data ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-foreground/10 animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-32 bg-foreground/10 animate-pulse rounded" />
                    <div className="h-3 w-20 bg-foreground/10 animate-pulse rounded" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: data.tenant.branding?.primary_color || "#1E1E1E" }}
                  >
                    {data.tenant.business_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-foreground truncate">
                      {data.tenant.business_name}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold capitalize ${
                          statusStyles[data.tenant.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {data.tenant.status}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold capitalize ${
                          planStyles[data.tenant.plan] ?? "bg-gray-100 text-gray-700"
                        }`}
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

            {/* ── Scrollable Body ────────────────────────────────────── */}
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

            {/* ── Sticky Footer ──────────────────────────────────────── */}
            {data && (
              <div className="shrink-0 p-3 border-t border-[var(--card-border)] bg-[var(--card-bg)] flex items-center gap-2">
                <button className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-400/30 dark:text-green-400 dark:bg-green-400/10 dark:hover:bg-green-400/15 transition-all">
                  Top Up
                </button>
                <button className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:border-blue-400/30 dark:text-blue-400 dark:bg-blue-400/10 dark:hover:bg-blue-400/15 transition-all">
                  Change Plan
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Panel Body ──────────────────────────────────────────────────────────

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
      {/* ── Quick Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="pastel-card p-2.5 bg-green-50/50 dark:bg-green-400/5">
          <div className="flex items-center gap-1 text-green-700 dark:text-green-400 mb-0.5">
            <Wallet className="w-3 h-3" />
            <span className="text-[9px] font-semibold">Balance</span>
          </div>
          <p className="text-xs font-bold text-foreground">
            {fmt(wallet?.balance_iqd ?? 0)} <span className="text-[9px] font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-2.5 bg-amber-50/50 dark:bg-amber-400/5">
          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 mb-0.5">
            <CreditCard className="w-3 h-3" />
            <span className="text-[9px] font-semibold">Charged</span>
          </div>
          <p className="text-xs font-bold text-foreground">
            {fmt(wallet?.total_charged_iqd ?? 0)} <span className="text-[9px] font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-2.5 bg-blue-50/50 dark:bg-blue-400/5">
          <div className="flex items-center gap-1 text-blue-700 dark:text-blue-400 mb-0.5">
            <ShoppingBag className="w-3 h-3" />
            <span className="text-[9px] font-semibold">Orders</span>
          </div>
          <p className="text-xs font-bold text-foreground">{fmt(orderCount)}</p>
        </div>
        <div className="pastel-card p-2.5 bg-purple-50/50 dark:bg-purple-400/5">
          <div className="flex items-center gap-1 text-purple-700 dark:text-purple-400 mb-0.5">
            <Users className="w-3 h-3" />
            <span className="text-[9px] font-semibold">Team</span>
          </div>
          <p className="text-xs font-bold text-foreground">{team.length}</p>
        </div>
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────── */}
      <div className="relative flex gap-0.5 border-b border-[var(--card-border)] overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-2.5 py-2 text-[11px] font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab
                ? "text-foreground"
                : "text-foreground/40 hover:text-foreground/60"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="panelTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────── */}
      {activeTab === "Overview" && (
        <OverviewTab tenant={tenant} subscription={subscription} />
      )}
      {activeTab === "Billing" && (
        <BillingTab wallet={wallet} transactions={transactions} />
      )}
      {activeTab === "Usage" && <UsageTab usage={usage} />}
      {activeTab === "Team" && <TeamTab team={team} />}
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
  );
}
