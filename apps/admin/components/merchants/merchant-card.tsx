"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  PanelRight,
  Star,
  ArrowUpRight,
  Wallet,
  Bell,
  Pin,
  Phone,
} from "lucide-react";
import { getMerchantCode } from "@scheniders/shared";
import { CopyableText } from "@/components/shared/copyable-text";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminTenant } from "@/types/admin";
import { MerchantContextMenu } from "@/components/shared/context-menu";
import { MerchantStatusDropdown } from "./merchant-status-dropdown";
import { MerchantPlanDropdown } from "./merchant-plan-dropdown";
import { HealthScoreTooltip } from "./health-score-tooltip";
import { QuickNotePopover } from "./quick-note-popover";
import { MerchantTags } from "./merchant-tags";
import { MerchantAlertFlag } from "./merchant-alert-flag";
import { LastActorBadge } from "./last-actor-badge";
import type { LastActor } from "@/hooks/use-last-actors";

interface MerchantCardProps {
  merchant: AdminTenant;
  isSelected: boolean;
  isPulsing?: boolean;
  isStarred?: boolean;
  index?: number;
  lastActor?: LastActor | null;
  onToggleSelect: (id: string) => void;
  onSelectWithShift?: (index: number, shiftKey: boolean) => void;
  onOpenDetail?: (id: string) => void;
  onOpenPanel?: (id: string) => void;
  onToggleStar?: (id: string) => void;
}

function formatCompactIQD(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return String(amount);
}

function getTrialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const now = new Date();
  const end = new Date(trialEndsAt);
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function calculateHealthScore(merchant: AdminTenant): number {
  let score = 50;
  if (merchant.status === "active") score += 15;
  else if (merchant.status === "trial") score += 5;
  else if (merchant.status === "suspended") score -= 20;
  const balance = merchant.wallet?.balance_iqd ?? 0;
  if (balance > 50000) score += 15;
  else if (balance > 10000) score += 5;
  else score -= 10;
  const orders = merchant.usage?.orders_count ?? 0;
  if (orders > 50) score += 15;
  else if (orders > 10) score += 10;
  else if (orders > 0) score += 5;
  if (merchant.plan === "enterprise") score += 5;
  else if (merchant.plan === "professional") score += 3;
  return Math.max(0, Math.min(100, score));
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

function timeAgo(dateStr: string): { text: string; color: string } {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = diff / (1000 * 60 * 60);
  const days = hours / 24;

  if (hours < 24) {
    const h = Math.floor(hours);
    return {
      text: h < 1 ? "Just now" : `${h}h ago`,
      color: "text-green-600 dark:text-green-400",
    };
  }
  if (days < 7) {
    return {
      text: `${Math.floor(days)}d ago`,
      color: "text-amber-600 dark:text-amber-400",
    };
  }
  if (days < 30) {
    return {
      text: `${Math.floor(days)}d ago`,
      color: "text-foreground/40",
    };
  }
  return {
    text: "30d+ ago",
    color: "text-foreground/30",
  };
}

export function MerchantCard({
  merchant,
  isSelected,
  isPulsing,
  isStarred,
  index,
  lastActor,
  onOpenDetail,
  onOpenPanel,
  onToggleSelect,
  onSelectWithShift,
  onToggleStar,
}: MerchantCardProps) {
  const logoChar = merchant.business_name?.charAt(0)?.toUpperCase() || "?";
  const logoBg = merchant.branding?.primary_color || "#1E1E1E";
  const healthScore = calculateHealthScore(merchant);
  const churnRisk = isChurnRisk(merchant);
  const lastActive = merchant.last_active_at ? timeAgo(merchant.last_active_at) : null;

  const balance = merchant.wallet?.balance_iqd ?? 0;
  // 30-day rolling order count — matches monthly_revenue's window so the
  // two figures on the card describe the same period. usage.orders_count
  // is calendar-month-to-date which would mix windows.
  const orders = merchant.orders_30d ?? 0;
  const monthlyRev = merchant.monthly_revenue ?? 0;
  const dailyRev = (merchant as { daily_revenue?: number }).daily_revenue ?? 0;
  const dailyOrders = merchant.order_sparkline?.[merchant.order_sparkline.length - 1] ?? 0;

  const queryClient = useQueryClient();
  const tagsMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      const res = await fetch(`/api/merchants/${merchant.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) throw new Error("Failed to update tags");
      return res.json();
    },
    onMutate: async (newTags) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "merchants"] });
      const previous = queryClient.getQueriesData({ queryKey: ["admin", "merchants"] });
      queryClient.setQueriesData(
        { queryKey: ["admin", "merchants"] },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              merchants: page.merchants.map((m: any) =>
                m.id === merchant.id ? { ...m, tags: newTags } : m
              ),
            })),
          };
        }
      );
      return { previous };
    },
    onError: (_err, _newTags, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]: [unknown, unknown]) =>
          queryClient.setQueryData(key as string[], data)
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    },
  });

  const handleAddTag = (tag: string) => {
    const current = merchant.tags ?? [];
    if (current.includes(tag)) return;
    tagsMutation.mutate([...current, tag]);
  };

  const handleRemoveTag = (tag: string) => {
    const next = (merchant.tags ?? []).filter((t) => t !== tag);
    tagsMutation.mutate(next);
  };

  return (
    <MerchantContextMenu merchantId={merchant.id} merchantSlug={merchant.slug}>
      <div
        className={cn(
          "pastel-card group relative overflow-hidden p-5 transition-all duration-200",
          "hover:shadow-[var(--card-shadow-hover)] hover:-translate-y-0.5",
          isSelected &&
            "ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]",
          isPulsing && "animate-pulse-glow"
        )}
      >
        {/* Decorative ambient gradient — emanates from logo color */}
        <div
          aria-hidden
          className="absolute -top-16 -right-16 w-44 h-44 rounded-full opacity-[0.08] blur-3xl pointer-events-none transition-opacity duration-300 group-hover:opacity-[0.16]"
          style={{ backgroundColor: logoBg }}
        />

        {/* Top utility row */}
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                if (onSelectWithShift && index !== undefined) {
                  onSelectWithShift(
                    index,
                    e.nativeEvent instanceof MouseEvent &&
                      (e.nativeEvent as MouseEvent).shiftKey
                  );
                } else {
                  onToggleSelect(merchant.id);
                }
              }}
              className="w-4 h-4 rounded border-[var(--card-border)] accent-[#1E1E1E] cursor-pointer"
            />
            {onToggleStar && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStar(merchant.id);
                }}
                className={cn(
                  "p-0.5 rounded transition-colors",
                  isStarred
                    ? "text-amber-400 hover:text-amber-500"
                    : "text-foreground/20 hover:text-foreground/50"
                )}
                aria-label={isStarred ? "Unstar" : "Star"}
              >
                <Star className={cn("w-3.5 h-3.5", isStarred && "fill-current")} />
              </button>
            )}
            <HealthScoreTooltip
              merchant={merchant}
              score={healthScore}
              isChurnRisk={churnRisk}
            />
            <MerchantAlertFlag merchant={merchant} />
            {lastActor && <LastActorBadge actor={lastActor} size="xs" />}
          </div>
          <MerchantPlanDropdown merchantId={merchant.id} plan={merchant.plan} />
        </div>

        {/* Pinned note preview */}
        {merchant.pinned_note && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail?.(merchant.id);
            }}
            className="relative mt-2 w-full flex items-start gap-1.5 px-2 py-1.5 rounded-xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-400/10 dark:to-yellow-400/5 border border-amber-200/60 dark:border-amber-400/20 text-left hover:from-amber-100 hover:to-yellow-100 dark:hover:from-amber-400/15 transition-colors group/note"
          >
            <Pin className="w-2.5 h-2.5 text-amber-700 dark:text-amber-300 -rotate-45 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-900 dark:text-amber-100 font-semibold line-clamp-1 leading-snug flex-1">
              {merchant.pinned_note.content}
            </p>
          </button>
        )}

        {/* Prospect badge */}
        {merchant.is_prospect && (
          <div className="relative mt-2">
            <Link
              href={
                merchant.prospect_lead_id
                  ? `/leads/${merchant.prospect_lead_id}`
                  : "#"
              }
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-400/25 transition-colors"
            >
              PROSPECT
              <ArrowUpRight className="w-2.5 h-2.5" />
            </Link>
          </div>
        )}

        {/* Brand identity */}
        <div className="relative flex items-center gap-3.5 mt-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shrink-0 ring-1 ring-black/5 shadow-sm"
            style={{ backgroundColor: logoBg }}
          >
            {logoChar}
          </div>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => onOpenDetail?.(merchant.id)}
              className="text-[15px] font-black text-foreground tracking-tight truncate block text-left hover:underline cursor-pointer leading-tight"
            >
              {merchant.business_name}
            </button>
            <div className="flex items-center gap-2 mt-0.5 min-w-0">
              <span className="text-[11px] text-foreground/50 truncate font-medium">
                {merchant.slug}
              </span>
              <span className="w-0.5 h-0.5 rounded-full bg-foreground/20 shrink-0" />
              <CopyableText
                value={`#${getMerchantCode(merchant)}`}
                display={`#${getMerchantCode(merchant)}`}
                className="text-[11px] font-black tabular-nums text-violet-600 dark:text-violet-400 shrink-0 tracking-wide"
              />
            </div>
            {merchant.contact_phone && (
              <div className="flex items-center gap-1 mt-1 min-w-0">
                <Phone className="w-2.5 h-2.5 text-foreground/35 shrink-0" />
                <CopyableText
                  value={merchant.contact_phone}
                  className="text-[11px] font-bold tabular-nums text-foreground/65"
                />
              </div>
            )}
          </div>
          <MerchantStatusDropdown
            merchantId={merchant.id}
            status={merchant.status}
          />
        </div>

        {/* Hero stats: Balance + Revenue (paired big numbers) */}
        <div className="relative grid grid-cols-2 gap-3 mt-5 p-3.5 rounded-2xl bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.015] dark:from-white/[0.04] dark:to-white/[0.01] border border-foreground/[0.05]">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.08em] text-foreground/45 font-black flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
              Balance
            </p>
            <p className="text-lg font-black text-foreground tabular-nums truncate mt-1 leading-none">
              {formatCompactIQD(balance)}
              <span className="text-[10px] font-bold text-foreground/40 ml-1">
                IQD
              </span>
            </p>
            <p className="text-[10px] text-foreground/45 font-medium mt-1 truncate">
              {merchant.city || "—"}
            </p>
          </div>
          <div className="min-w-0 border-l border-foreground/[0.08] pl-3">
            <p className="text-[9px] uppercase tracking-[0.08em] text-foreground/45 font-black flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-violet-500 shrink-0" />
              Revenue
            </p>
            <p className="text-lg font-black text-foreground tabular-nums truncate mt-1 leading-none">
              {formatCompactIQD(monthlyRev)}
              <span className="text-[10px] font-bold text-foreground/40 ml-1">
                /mo
              </span>
            </p>
            <p className="text-[10px] text-foreground/45 font-medium mt-1 tabular-nums truncate">
              {orders} {orders === 1 ? "order" : "orders"}
              {lastActive && (
                <>
                  <span className="mx-1 text-foreground/20">·</span>
                  <span className={cn("font-semibold", lastActive.color)}>
                    {lastActive.text}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Today strip — daily orders + daily revenue */}
        <div className="relative mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-400/10 dark:to-cyan-400/10 border border-emerald-200/60 dark:border-emerald-400/20">
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1 shrink-0">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              (dailyOrders > 0 || dailyRev > 0) ? "bg-emerald-500 animate-pulse" : "bg-foreground/20"
            )} />
            Today
          </span>
          <span className="text-[11px] font-black text-foreground tabular-nums">
            {dailyOrders}
            <span className="text-[9px] font-bold text-foreground/45 ml-0.5">
              {dailyOrders === 1 ? "order" : "orders"}
            </span>
          </span>
          <span className="w-0.5 h-0.5 rounded-full bg-foreground/20" />
          <span className="text-[11px] font-black text-foreground tabular-nums truncate">
            {formatCompactIQD(dailyRev)}
            <span className="text-[9px] font-bold text-foreground/45 ml-0.5">IQD</span>
          </span>
        </div>

        {/* Tags */}
        {(merchant.tags?.length ?? 0) > 0 && (
          <div className="relative mt-3">
            <MerchantTags
              tags={merchant.tags ?? []}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              compact
            />
          </div>
        )}

        {/* Footer: quick-action toolbar */}
        <div className="relative mt-4 pt-3 border-t border-[var(--card-border)] flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenDetail?.(merchant.id)}
            className="flex-1 flex items-center justify-center gap-1 h-8 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:hover:bg-emerald-400/20 dark:text-emerald-400 text-[11px] font-bold transition-colors"
            title="Top up wallet"
            aria-label="Top up wallet"
          >
            <Wallet className="w-3.5 h-3.5" />
            Top Up
          </button>
          <button
            type="button"
            onClick={() => onOpenDetail?.(merchant.id)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 dark:bg-sky-400/10 dark:hover:bg-sky-400/20 dark:text-sky-400 transition-colors"
            title="Send notification"
            aria-label="Send notification"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>
          <QuickNotePopover merchantId={merchant.id} />
          <button
            type="button"
            onClick={() => onOpenPanel?.(merchant.id)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
            title="Open in sidebar"
            aria-label="Open in sidebar"
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
          <Link
            href={`/merchants/${merchant.id}`}
            onClick={(e) => e.stopPropagation()}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
            title="Open merchant page"
            aria-label="Open merchant page"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </MerchantContextMenu>
  );
}
