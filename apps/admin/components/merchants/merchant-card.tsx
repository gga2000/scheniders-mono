"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Mail,
  Wallet,
  ShoppingBag,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Flame,
  Heart,
  PanelRight,
} from "lucide-react";
import type { AdminTenant, PlanTier, TenantStatus } from "@/types/admin";
import { MerchantContextMenu } from "@/components/shared/context-menu";
import { MerchantTags } from "./merchant-tags";

interface MerchantCardProps {
  merchant: AdminTenant;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenDetail?: (id: string) => void;
  onOpenPanel?: (id: string) => void;
}

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

const planBadgeStyles: Record<PlanTier, string> = {
  starter: "bg-[var(--pastel-blue)]/30 text-blue-800",
  growth: "bg-[var(--pastel-green)]/30 text-green-800",
  professional: "bg-[var(--pastel-purple)]/30 text-purple-800",
  enterprise: "bg-[var(--pastel-yellow)]/30 text-amber-800",
};

const statusConfig: Record<
  TenantStatus,
  { badge: string; dot: string; label: string }
> = {
  active: {
    badge: "bg-green-100 text-green-800",
    dot: "bg-green-500",
    label: "Active",
  },
  trial: {
    badge: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    label: "Trial",
  },
  suspended: {
    badge: "bg-red-100 text-red-800",
    dot: "bg-red-500",
    label: "Suspended",
  },
  cancelled: {
    badge: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
    label: "Cancelled",
  },
};

function getTrialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const now = new Date();
  const end = new Date(trialEndsAt);
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calculateHealthScore(merchant: AdminTenant): number {
  let score = 50; // baseline
  // Active status bonus
  if (merchant.status === "active") score += 15;
  else if (merchant.status === "trial") score += 5;
  else if (merchant.status === "suspended") score -= 20;
  // Wallet health
  const balance = merchant.wallet?.balance_iqd ?? 0;
  if (balance > 50000) score += 15;
  else if (balance > 10000) score += 5;
  else score -= 10;
  // Order activity
  const orders = merchant.usage?.orders_count ?? 0;
  if (orders > 50) score += 15;
  else if (orders > 10) score += 10;
  else if (orders > 0) score += 5;
  // Plan tier
  if (merchant.plan === "enterprise") score += 5;
  else if (merchant.plan === "professional") score += 3;
  return Math.max(0, Math.min(100, score));
}

function getHealthColor(score: number): string {
  if (score >= 70) return "text-green-600 bg-green-100 dark:bg-green-400/15 dark:text-green-400";
  if (score >= 40) return "text-amber-600 bg-amber-100 dark:bg-amber-400/15 dark:text-amber-400";
  return "text-red-600 bg-red-100 dark:bg-red-400/15 dark:text-red-400";
}

function isChurnRisk(merchant: AdminTenant): boolean {
  const balance = merchant.wallet?.balance_iqd ?? 0;
  const orders = merchant.usage?.orders_count ?? 0;
  if (merchant.status === "suspended") return true;
  if (balance < 5000 && orders < 5) return true;
  if (merchant.status === "trial") {
    const days = getTrialDaysRemaining(merchant.trial_ends_at);
    if (days !== null && days <= 3 && orders === 0) return true;
  }
  return false;
}

export function MerchantCard({
  merchant,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onOpenPanel,
}: MerchantCardProps) {
  const status = statusConfig[merchant.status];
  const planStyle = planBadgeStyles[merchant.plan];
  const trialDays =
    merchant.status === "trial"
      ? getTrialDaysRemaining(merchant.trial_ends_at)
      : null;

  const logoChar = merchant.business_name.charAt(0).toUpperCase();
  const logoBg = merchant.branding?.primary_color || "#1E1E1E";
  const healthScore = calculateHealthScore(merchant);
  const churnRisk = isChurnRisk(merchant);

  return (
    <MerchantContextMenu merchantId={merchant.id} merchantSlug={merchant.slug}>
      <div className={cn(
        "pastel-card p-5 group hover:shadow-[var(--card-shadow-hover)] transition-all duration-200 border-l-4",
        healthScore >= 70
          ? "border-l-green-500 dark:border-l-green-400"
          : healthScore >= 40
            ? "border-l-amber-500 dark:border-l-amber-400"
            : "border-l-red-500 dark:border-l-red-400"
      )}>
        {/* Top row: checkbox + health score + plan badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(merchant.id)}
              className="w-4 h-4 rounded border-[var(--card-border)] accent-[#1E1E1E]"
            />
            {/* Health Score Badge */}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${getHealthColor(healthScore)}`}>
              <Heart className="w-2.5 h-2.5" />
              {healthScore}
            </span>
            {/* Churn Risk */}
            {churnRisk && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-red-500" title="Churn risk">
                <Flame className="w-3 h-3" />
              </span>
            )}
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${planStyle}`}
          >
            {merchant.plan}
          </span>
        </div>

        {/* Business name row */}
        <div className="flex items-center gap-3 mt-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: logoBg }}
          >
            {logoChar}
          </div>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => onOpenDetail?.(merchant.id)}
              className="text-sm font-bold text-foreground truncate block text-left hover:underline cursor-pointer"
            >
              {merchant.business_name}
            </button>
            <p className="text-[11px] text-foreground/50 truncate">
              {merchant.slug}
            </p>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 shrink-0 ${status.badge}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="flex items-center gap-1.5 text-xs text-foreground/60">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground/80 truncate">
              {merchant.city || "\u2014"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-foreground/60">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground/80 truncate">
              {merchant.contact_email || "\u2014"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-foreground/60">
            <Wallet className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground/80 truncate">
              {formatIQD(merchant.wallet?.balance_iqd ?? 0)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-foreground/60">
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground/80 truncate">
              {merchant.usage?.orders_count ?? 0} orders
            </span>
          </div>
        </div>

        {/* Trial countdown */}
        {merchant.status === "trial" && trialDays !== null && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {trialDays > 0
              ? `Trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"}`
              : "Trial expired"}
          </div>
        )}

        {/* Bottom row */}
        <div className="mt-4 pt-3 border-t border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/merchants/${merchant.id}`}
              className="text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View
            </Link>
            <button
              type="button"
              className="text-xs font-semibold text-green-600/70 hover:text-green-700 transition-colors"
            >
              Top Up
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenPanel?.(merchant.id)}
              className="p-1 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-colors"
              title="Open in sidebar"
              aria-label="Open in sidebar"
            >
              <PanelRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </MerchantContextMenu>
  );
}
