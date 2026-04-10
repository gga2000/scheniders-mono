"use client";

import Link from "next/link";
import {
  MapPin,
  Mail,
  Wallet,
  ShoppingBag,
  Clock,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import type { AdminTenant, PlanTier, TenantStatus } from "@/types/admin";

interface MerchantCardProps {
  merchant: AdminTenant;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
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

export function MerchantCard({
  merchant,
  isSelected,
  onToggleSelect,
}: MerchantCardProps) {
  const status = statusConfig[merchant.status];
  const planStyle = planBadgeStyles[merchant.plan];
  const trialDays =
    merchant.status === "trial"
      ? getTrialDaysRemaining(merchant.trial_ends_at)
      : null;

  const logoChar = merchant.business_name.charAt(0).toUpperCase();
  const logoBg = merchant.branding?.primary_color || "#1E1E1E";

  return (
    <div className="pastel-card p-5 group hover:shadow-[var(--card-shadow-hover)] transition-all duration-200">
      {/* Top row: checkbox + plan badge */}
      <div className="flex items-center justify-between">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(merchant.id)}
          className="w-4 h-4 rounded border-[var(--card-border)] accent-[#1E1E1E]"
        />
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
          <h3 className="text-sm font-bold text-foreground truncate">
            {merchant.business_name}
          </h3>
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
        <button
          type="button"
          className="p-1 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
