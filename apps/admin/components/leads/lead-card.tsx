"use client";

import { cn } from "@/lib/utils";
import { AddedByAvatar } from "@/components/leads/added-by-avatar";
import type { Lead } from "@/types/leads";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
} from "@/types/leads";
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
} from "lucide-react";
import { motion } from "framer-motion";

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
  const platformConfig = PLATFORM_CONFIG[lead.platform];
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
      whileHover={tier === "legendary" ? { y: -4 } : tier === "diamond" ? { y: -2 } : {}}
      onClick={onClick}
      className={cn(
        "lead-card relative rounded-2xl p-5 cursor-pointer transition-all duration-300 overflow-hidden group",
        `lead-card--${tier}`,
        isSelected && "ring-2 ring-[var(--primary)]",
        stalenessClass === "stale" && "lead-card--stale",
        stalenessClass === "cold" && "lead-card--cold"
      )}
    >
      {/* ── Tier Visual Layers ───────────────────────────── */}

      {/* Bronze: simple flat bg */}
      {tier === "bronze" && (
        <div className="absolute inset-0 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl" />
      )}

      {/* Silver: gradient border shimmer */}
      {tier === "silver" && (
        <>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-zinc-200 via-zinc-300 to-zinc-200 dark:from-zinc-600 dark:via-zinc-500 dark:to-zinc-600 p-[1px]">
            <div className="absolute inset-[1px] bg-[var(--card-bg)] rounded-[15px]" />
          </div>
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-[linear-gradient(110deg,transparent_25%,rgba(192,192,192,0.12)_50%,transparent_75%)] bg-[length:250%_100%] group-hover:animate-shimmer" />
        </>
      )}

      {/* Gold: warm gradient border + glow */}
      {tier === "gold" && (
        <>
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-300 dark:from-amber-500 dark:via-yellow-500 dark:to-amber-500 p-[1.5px]">
            <div className="absolute inset-[1.5px] bg-[var(--card-bg)] rounded-[14.5px]" />
          </div>
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 shadow-[0_0_30px_rgba(255,215,0,0.15)]" />
          <div className="absolute inset-0 rounded-2xl opacity-30 group-hover:opacity-60 transition-opacity duration-700 bg-[linear-gradient(110deg,transparent_20%,rgba(255,215,0,0.08)_45%,rgba(255,215,0,0.15)_55%,transparent_80%)] bg-[length:300%_100%] animate-shimmer" />
          {/* Gold star particles */}
          <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-amber-400/40 rounded-full group-hover:animate-pulse" />
          <div className="absolute top-6 right-8 w-1 h-1 bg-yellow-400/30 rounded-full group-hover:animate-pulse delay-300" />
        </>
      )}

      {/* Diamond: prismatic border + glass */}
      {tier === "diamond" && (
        <>
          <div className="absolute inset-0 rounded-2xl p-[2px] bg-[conic-gradient(from_var(--diamond-angle,0deg),#60a5fa,#a78bfa,#06b6d4,#60a5fa)] animate-border-rotate">
            <div className="absolute inset-[2px] bg-[var(--card-bg)] rounded-[14px] backdrop-blur-sm" />
          </div>
          <div className="absolute inset-0 rounded-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 bg-[radial-gradient(ellipse_at_top,rgba(96,165,250,0.2),transparent_60%)]" />
          {/* Sparkle dots */}
          <div className="absolute top-4 right-4 w-2 h-2 bg-blue-400/50 rounded-full animate-sparkle" />
          <div className="absolute bottom-6 left-6 w-1.5 h-1.5 bg-purple-400/40 rounded-full animate-sparkle delay-500" />
          <div className="absolute top-1/2 right-8 w-1 h-1 bg-cyan-400/50 rounded-full animate-sparkle delay-1000" />
        </>
      )}

      {/* Legendary: refined pink → violet border + soft glow */}
      {tier === "legendary" && (
        <>
          {/* Gradient border */}
          <div className="absolute inset-0 rounded-2xl p-[1.5px] bg-gradient-to-br from-[#FF6EFF] via-[#A78BFA] to-[#FF8899]">
            <div className="absolute inset-[1.5px] bg-[var(--card-bg)] rounded-[14.5px]" />
          </div>
          {/* Soft glow on hover */}
          <div className="absolute -inset-1 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(ellipse_at_top,rgba(255,110,255,0.18),transparent_65%)] blur-lg" />
          {/* Two understated sparkles */}
          <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-[#FF6EFF]/40 group-hover:animate-pulse" />
          <div className="absolute bottom-5 left-5 w-1 h-1 rounded-full bg-[#A78BFA]/40 group-hover:animate-pulse delay-300" />
        </>
      )}

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

            {/* Tier badge */}
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                tier === "legendary" && "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
                tier === "diamond" && "bg-blue-500/10 text-blue-500 dark:text-blue-400",
                tier === "gold" && "bg-amber-500/10 text-amber-600 dark:text-amber-500",
                tier === "silver" && "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
                tier === "bronze" && "bg-orange-900/10 text-orange-700 dark:text-orange-400"
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
              <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-500">
                STALE
              </div>
            )}
            {stalenessClass === "cold" && (
              <div className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500">
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
        <div className="flex items-center gap-2 mb-3 text-sm text-[var(--muted)]">
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: `${platformConfig.color}15`, color: platformConfig.color }}
          >
            {platformConfig.label}
          </span>
          {lead.industry && (
            <span className="truncate text-xs">{lead.industry.name}</span>
          )}
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Followers</div>
            <div className="text-sm font-bold text-[var(--foreground)]">
              {lead.follower_count >= 1000
                ? `${(lead.follower_count / 1000).toFixed(lead.follower_count >= 10000 ? 0 : 1)}K`
                : lead.follower_count}
            </div>
          </div>
          <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Engagement</div>
            <div className="text-sm font-bold text-[var(--foreground)]">{engagementRate}%</div>
          </div>
        </div>

        {/* Prediction */}
        {lead.estimated_daily_orders > 0 && (
          <div className="flex items-center gap-1.5 mb-3 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[var(--muted)]">~</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{lead.estimated_daily_orders}</span>
            <span className="text-[var(--muted)]">orders/day</span>
          </div>
        )}

        {/* Score bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">Score</span>
            <span className="text-xs font-bold text-[var(--foreground)]">{lead.lead_score}</span>
          </div>
          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${lead.lead_score}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{
                background: tier === "legendary"
                  ? "linear-gradient(90deg, #FF6EFF, #A78BFA)"
                  : tier === "diamond"
                    ? "linear-gradient(90deg, #60a5fa, #a78bfa, #06b6d4)"
                    : tier === "gold"
                      ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                      : tier === "silver"
                        ? "linear-gradient(90deg, #9ca3af, #d1d5db)"
                        : "#a1a1aa",
              }}
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
                <span className="text-[10px] text-[var(--muted)]/70">
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
          <div className="flex items-center gap-1 text-[10px] text-[var(--muted)] mb-3">
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
