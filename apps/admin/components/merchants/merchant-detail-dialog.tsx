"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useMerchantDetail } from "@/hooks/use-merchant-detail";
import { useAdminStore } from "@/store/use-admin-store";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@scheniders/ui/dialog";
import {
  Wallet,
  CreditCard,
  ShoppingBag,
  Users,
  UserCircle,
  Loader2,
  PanelRight,
  Maximize2,
  X,
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
  data: NonNullable<ReturnType<typeof useMerchantDetail>["data"]>;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  noteText: string;
  setNoteText: (v: string) => void;
  onOpenPanel: () => void;
  onOpenFullscreen: () => void;
  merchantId: string;
}) {
  const { tenant, wallet, subscription, transactions, usage, team, notes, orderCount } = data;
  const primaryColor = tenant.branding?.primary_color || "#1E1E1E";

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
              {tenant.business_name}
            </DialogTitle>
            <p className="text-sm text-foreground/50">{tenant.slug}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                  statusStyles[tenant.status] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {tenant.status}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                  planStyles[tenant.plan] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {tenant.plan}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenPanel}
            className="p-2 rounded-xl text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all"
            title="Open in sidebar"
            aria-label="Open in sidebar panel"
          >
            <PanelRight className="w-4 h-4" />
          </button>
          <Link
            href={`/merchants/${merchantId}`}
            onClick={onOpenFullscreen}
            className="p-2 rounded-xl text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-all"
            title="Open fullscreen"
            aria-label="Open fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* ── Quick Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="pastel-card p-3 bg-green-50/50 dark:bg-green-400/5">
          <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 mb-0.5">
            <Wallet className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">Balance</span>
          </div>
          <p className="text-sm font-bold text-foreground">
            {fmt(wallet?.balance_iqd ?? 0)} <span className="text-[10px] font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-3 bg-amber-50/50 dark:bg-amber-400/5">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 mb-0.5">
            <CreditCard className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">Charged</span>
          </div>
          <p className="text-sm font-bold text-foreground">
            {fmt(wallet?.total_charged_iqd ?? 0)} <span className="text-[10px] font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-3 bg-blue-50/50 dark:bg-blue-400/5">
          <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400 mb-0.5">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">Orders</span>
          </div>
          <p className="text-sm font-bold text-foreground">{fmt(orderCount)}</p>
        </div>
        <div className="pastel-card p-3 bg-purple-50/50 dark:bg-purple-400/5">
          <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-400 mb-0.5">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">Team</span>
          </div>
          <p className="text-sm font-bold text-foreground">{team.length}</p>
        </div>
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────── */}
      <div className="relative flex gap-0.5 border-b border-[var(--card-border)] overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab
                ? "text-foreground"
                : "text-foreground/40 hover:text-foreground/60"
            }`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="dialogTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <div className="min-h-[300px]">
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
    </div>
  );
}
