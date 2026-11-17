"use client";

import { patchMerchantInCache } from "@/hooks/use-infinite-merchants";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Star,
  ArrowUpRight,
  Wallet,
  Pin,
  Phone,
} from "lucide-react";
import { getMerchantCode } from "@scheniders/shared";
import { CopyableText } from "@/components/shared/copyable-text";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdminTenant } from "@/types/admin";
import { MerchantContextMenu } from "@/components/shared/context-menu";
import { MerchantStatusDropdown } from "./merchant-status-dropdown";
import { LockedChip } from "./locked-chip";
import { MerchantPlanDropdown } from "./merchant-plan-dropdown";
import { HealthScoreTooltip } from "./health-score-tooltip";
import { QuickNotePopover } from "./quick-note-popover";
import { MerchantTags } from "./merchant-tags";
import { MerchantAlertFlag } from "./merchant-alert-flag";
import { LastActorBadge } from "./last-actor-badge";
import type { LastActor } from "@/hooks/use-last-actors";
import { listChurnRisk } from "@/lib/merchant-health";
import { formatCount, formatWhen } from "@/lib/format";
import { useCan } from "@/hooks/use-admin-auth";
import { freeDaysKind } from "@/lib/shop-actions";

interface MerchantCardProps {
  merchant: AdminTenant;
  isSelected: boolean;
  isStarred?: boolean;
  index?: number;
  lastActor?: LastActor | null;
  onToggleSelect: (id: string) => void;
  onSelectWithShift?: (index: number, shiftKey: boolean) => void;
  onOpenDetail?: (id: string) => void;
  onToggleStar?: (id: string) => void;
}

/** When the shop was last active, coloured green within a day and amber within a week. */
function lastActiveLine(dateStr: string): { text: string; color: string } {
  const days = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
  const color =
    days < 1 ? "text-green-600 dark:text-green-400" : days < 7 ? "text-amber-600 dark:text-amber-400" : "text-foreground/40";
  return { text: `Active ${formatWhen(dateStr)}`, color };
}


export function MerchantCard({
  merchant,
  isSelected,
  isStarred,
  index,
  lastActor,
  onOpenDetail,
  onToggleSelect,
  onSelectWithShift,
  onToggleStar,
}: MerchantCardProps) {
  const can = useCan();
  // The shop page's rule: a shop on trial gets trial days, a paying shop days on its month.
  const freeDays = freeDaysKind(
    {
      status: merchant.status,
      locked: merchant.billing_lock != null,
      subscriptionRunning: merchant.subscription_running ?? false,
      // The list holds customer shops only (lib/customer-shops), never the demo store.
      demo: false,
    },
    can,
  );
  const logoChar = merchant.business_name?.charAt(0)?.toUpperCase() || "?";
  const logoBg = merchant.branding?.primary_color || "#1E1E1E";
  const healthScore = merchant.staff_health_score;
  const churnRisk = listChurnRisk(merchant);
  const lastActive = merchant.last_active_at ? lastActiveLine(merchant.last_active_at) : null;

  const balance = merchant.wallet?.balance_iqd ?? 0;
  // Real orders and our fees over the same last 30 days.
  const orders = merchant.orders_30d ?? 0;
  const fees30d = merchant.fees_30d;
  const feesToday = merchant.fees_today;
  const dailyOrders = merchant.order_sparkline?.[merchant.order_sparkline.length - 1] ?? 0;

  const queryClient = useQueryClient();
  const tagsMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      const res = await fetch(`/api/merchants/${merchant.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Tags were not saved");
      }
      return res.json();
    },
    onMutate: async (newTags) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "merchants"] });
      return { restore: patchMerchantInCache(queryClient, merchant.id, { tags: newTags }) };
    },
    onError: (error: Error, _newTags, context) => {
      context?.restore();
      toast.error(error.message);
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
    <MerchantContextMenu merchantId={merchant.id} merchantSlug={merchant.slug} freeDays={freeDays !== null}>
      <div
        className={cn(
          "pastel-card group relative overflow-hidden p-5 transition-all duration-200",
          "hover:shadow-[var(--card-shadow-hover)] hover:-translate-y-0.5",
          isSelected &&
            "ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]"
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
            {/* max-w-full: a block button is as wide as its text, so without it a
                long name ran under the status chips and never got its "…".
                The title shows the whole name when it is cut. */}
            <button
              onClick={() => onOpenDetail?.(merchant.id)}
              title={merchant.business_name}
              className="text-[15px] font-black text-foreground tracking-tight truncate name-dir block max-w-full text-left hover:underline cursor-pointer leading-tight"
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
          <div className="flex flex-col items-end gap-1 shrink-0">
            <MerchantStatusDropdown
              merchantId={merchant.id}
              status={merchant.status}
              trialSubscription={merchant.trial_subscription ?? false}
            />
            {merchant.billing_lock && <LockedChip lock={merchant.billing_lock} />}
          </div>
        </div>

        {/* Hero stats: Balance + Revenue (paired big numbers) */}
        <div className="relative grid grid-cols-2 gap-3 mt-5 p-3.5 rounded-2xl bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.015] dark:from-white/[0.04] dark:to-white/[0.01] border border-foreground/[0.05]">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.08em] text-foreground/45 font-black flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
              Balance
            </p>
            <p className="text-lg font-black text-foreground tabular-nums truncate mt-1 leading-none">
              {formatCount(balance)}
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
              Our fees, 30 days
            </p>
            <p className="text-lg font-black text-foreground tabular-nums truncate mt-1 leading-none">
              {formatCount(fees30d)}
              <span className="text-[10px] font-bold text-foreground/40 ml-1">
                IQD
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

        {/* Today strip: orders and our fees today */}
        <div className="relative mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-400/10 dark:to-cyan-400/10 border border-emerald-200/60 dark:border-emerald-400/20">
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1 shrink-0">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              (dailyOrders > 0 || feesToday > 0) ? "bg-emerald-500 animate-pulse" : "bg-foreground/20"
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
            {formatCount(feesToday)}
            <span className="text-[9px] font-bold text-foreground/45 ml-0.5">IQD fees</span>
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
          {/* Only for someone who may add money; the note and link keep their place. */}
          {can("top_up_wallet") ? (
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
          ) : (
            <span className="flex-1" />
          )}
          <QuickNotePopover merchantId={merchant.id} />
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
