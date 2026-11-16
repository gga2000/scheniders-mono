"use client";

import { cn } from "@/lib/utils";
import { AddedByAvatar } from "@/components/leads/added-by-avatar";
import type { Lead } from "@/types/leads";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
} from "@/types/leads";
import { PlatformChip, IndustryChip } from "@/components/leads/lead-chips";
import {
  Phone,
  MessageCircle,
  StickyNote,
  MoreVertical,
  MapPin,
  TrendingUp,
  Clock,
  Star,
  Diamond,
  Crown,
  Award,
  Circle,
  Globe,
  Pencil,
} from "lucide-react";
import { motion } from "framer-motion";

/**
 * Board v6: no gradients, glows or sparkles. A lead's tier shows in the card's
 * border and its score bar, one flat colour each.
 */
const TIER_BORDER: Record<Lead["tier"], string> = {
  bronze: "border-[var(--card-border)]",
  silver: "border-zinc-400 dark:border-zinc-500",
  gold: "border-amber-500",
  diamond: "border-teal-600 dark:border-teal-400",
  legendary: "border-2 border-[#E4B5D1]",
};
const TIER_BAR: Record<Lead["tier"], string> = {
  bronze: "bg-zinc-400",
  silver: "bg-zinc-500",
  gold: "bg-amber-500",
  diamond: "bg-teal-600",
  legendary: "bg-[#D48FB8]",
};

const TIER_ICONS = { bronze: Circle, silver: Award, gold: Star, diamond: Diamond, legendary: Crown };

interface LeadCardProps {
  lead: Lead;
  onSelect?: () => void;
  onQuickCall?: () => void;
  onQuickWhatsApp?: () => void;
  onQuickNote?: () => void;
  onClick?: () => void;
  isSelected?: boolean;
}

export function LeadCard({
  lead,
  onSelect,
  onQuickCall,
  onQuickWhatsApp,
  onQuickNote,
  onClick,
  isSelected,
}: LeadCardProps) {
  const tier = lead.tier;
  const tierConfig = LEAD_TIER_CONFIG[tier];
  const statusConfig = LEAD_STATUS_CONFIG[lead.status];
  const statusUi = LEAD_STATUS_UI[lead.status];
  const priorityConfig = LEAD_PRIORITY_CONFIG[lead.priority];
  const TierIcon = TIER_ICONS[tier];

  // Staleness
  const daysSinceContact = lead.last_contacted_at
    ? Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const stalenessClass =
    daysSinceContact === null
      ? ""
      : daysSinceContact > 7
        ? "stale"
        : daysSinceContact > 3
          ? "cold"
          : "";

  // Engagement rate
  const engagementRate =
    lead.follower_count > 0
      ? (((lead.avg_like_count + lead.avg_comments_count) / lead.follower_count) * 100).toFixed(1)
      : "0";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      onClick={onClick}
      className={cn(
        "lead-card relative rounded-2xl p-5 cursor-pointer transition-all duration-300 overflow-hidden group",
        `lead-card--${tier}`,
        isSelected && "ring-2 ring-[var(--primary)]",
        stalenessClass === "stale" && "lead-card--stale",
        stalenessClass === "cold" && "lead-card--cold",
        lead.is_draft &&
          "outline-2 outline-dashed outline-amber-400/70 -outline-offset-2"
      )}
    >
      {/* One flat surface; the border names the tier (board v6). */}
      <div className={cn("absolute inset-0 rounded-2xl border bg-[var(--card-bg)]", TIER_BORDER[tier])} />

      {/* ── Card Content (above visual layers) ────────── */}
      <div className="relative z-10">
        {/* Top Row: Select + Tier Badge + Priority + Menu */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.();
              }}
              className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                isSelected
                  ? "bg-[var(--primary)] border-[var(--primary)]"
                  : "border-zinc-300 dark:border-zinc-600 hover:border-zinc-400"
              )}
            >
              {isSelected && (
                <svg className="w-3 h-3 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Draft badge — takes precedence visually over tier */}
            {lead.is_draft && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/15 text-[var(--ink-amber)]">
                <Pencil className="w-3 h-3" />
                Draft
              </span>
            )}

            {/* Tier badge */}
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                tier === "legendary" && "bg-fuchsia-500/10 text-[var(--ink-fuchsia)]",
                tier === "diamond" && "bg-blue-500/10 text-[var(--ink-blue)]",
                tier === "gold" && "bg-amber-500/10 text-[var(--ink-amber)]",
                tier === "silver" && "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
                tier === "bronze" && "bg-orange-900/10 text-[var(--ink-orange)]"
              )}
            >
              <TierIcon className="w-3 h-3" />
              <span>{tierConfig.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Priority dot */}
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: priorityConfig.color }}
              title={`${priorityConfig.label} priority`}
            />

            {/* Staleness indicator */}
            {stalenessClass === "stale" && (
              <div className="px-1.5 py-0.5 rounded text-xs font-bold bg-red-500/15 text-[var(--ink-red)]">
                STALE
              </div>
            )}
            {stalenessClass === "cold" && (
              <div className="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-[var(--ink-amber)]">
                COLD
              </div>
            )}

            <button
              onClick={(e) => e.stopPropagation()}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Business Name */}
        <div className="flex items-center gap-1.5 mb-1">
          <h3 className="font-bold text-base truncate text-[var(--foreground)]">
            {lead.merchant_name}
          </h3>
          <span onClick={(e) => e.stopPropagation()}>
            <AddedByAvatar user={lead.created_by_user} addedAt={lead.created_at} />
          </span>
        </div>

        {/* Platform + Industry */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <PlatformChip platform={lead.platform} size="sm" />
          {lead.industry && <IndustryChip industry={lead.industry} size="sm" />}
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-lg px-2.5 py-1.5">
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Followers</div>
            <div className="text-sm font-bold text-[var(--foreground)]">
              {lead.follower_count >= 1000
                ? `${(lead.follower_count / 1000).toFixed(lead.follower_count >= 10000 ? 0 : 1)}K`
                : lead.follower_count}
            </div>
          </div>
          <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-lg px-2.5 py-1.5">
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Engagement</div>
            <div className="text-sm font-bold text-[var(--foreground)]">{engagementRate}%</div>
          </div>
        </div>

        {/* Prediction */}
        {lead.estimated_daily_orders > 0 && (
          <div className="flex items-center gap-1.5 mb-3 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-[var(--ink-green)]" />
            <span className="text-[var(--muted)]">~</span>
            <span className="font-bold text-[var(--ink-green)]">{lead.estimated_daily_orders}</span>
            <span className="text-[var(--muted)]">orders/day</span>
          </div>
        )}

        {/* Score bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-[var(--muted)] uppercase tracking-wider">Score</span>
            <span className="text-xs font-bold text-[var(--foreground)]">{lead.lead_score}</span>
          </div>
          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${lead.lead_score}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={cn("h-full rounded-full", TIER_BAR[tier])}
            />
          </div>
        </div>

        {/* Status + Location */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ backgroundColor: statusUi.soft, color: statusUi.solid }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: statusUi.solid }}
            />
            {statusConfig.label}
          </span>
          {lead.is_online_only ? (
            <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
              <Globe className="w-3 h-3" />
              Online
            </span>
          ) : lead.city || lead.branches?.length ? (
            <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
              <MapPin className="w-3 h-3" />
              {lead.city || `${lead.branches.length} branch${lead.branches.length > 1 ? "es" : ""}`}
              {lead.city && lead.branches?.length > 0 && (
                <span className="text-xs text-[var(--muted)]/70">
                  +{lead.branches.length}
                </span>
              )}
            </span>
          ) : null}
        </div>

        {/* Contact info */}
        {lead.management_name && (
          <div className="text-xs text-[var(--muted)] mb-2 truncate">
            {lead.management_name}
          </div>
        )}

        {/* Last contacted */}
        {lead.last_contacted_at && (
          <div className="flex items-center gap-1 text-xs text-[var(--muted)] mb-3">
            <Clock className="w-3 h-3" />
            Last contacted {daysSinceContact}d ago
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-1 pt-2 border-t border-black/[0.05] dark:border-white/[0.05]">
          <button
            onClick={(e) => { e.stopPropagation(); onQuickCall?.(); }}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Call</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onQuickWhatsApp?.(); }}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onQuickNote?.(); }}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
          >
            <StickyNote className="w-3.5 h-3.5" />
            <span>Note</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
