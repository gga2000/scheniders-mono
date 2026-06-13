"use client";

import type { ReactNode } from "react";
import type { Lead } from "@/types/leads";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_PRIORITY_CONFIG,
  LEAD_PRIORITY_UI,
  LEAD_TIER_CONFIG,
  LEAD_TIER_UI,
} from "@/types/leads";
import { PlatformChip, IndustryChip, TierChip } from "@/components/leads/lead-chips";
import { AddedByAvatar } from "@/components/leads/added-by-avatar";
import type { LeadColumnId } from "@/lib/leads-table-columns";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

/** Extra inputs a cell may need beyond the Lead. Built once per render by <LeadsTable>. */
export interface LeadCellContext {
  onQuickCall: (lead: Lead) => void;
  onQuickWhatsApp: (lead: Lead) => void;
}

/** Absolute "12 Jun 2026" + a relative hint ("3d ago") for the Date added column. */
export function formatAdded(iso: string): { date: string; rel: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const rel =
    days <= 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : days < 30
          ? `${days}d ago`
          : days < 365
            ? `${Math.floor(days / 30)}mo ago`
            : `${Math.floor(days / 365)}y ago`;
  return { date, rel };
}

// ── Presentational cells (inner <td> content only; the row owns the <td> + click) ──

function MerchantCell({ lead }: { lead: Lead }) {
  const tierCfg = LEAD_TIER_CONFIG[lead.tier];
  const tierUi = LEAD_TIER_UI[lead.tier];
  const isWhale = lead.tier === "legendary" || lead.tier === "diamond";
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 transition-transform group-hover:scale-105"
        style={{
          backgroundImage: tierUi.gradient,
          boxShadow: isWhale
            ? `0 4px 14px -3px ${tierCfg.color}, inset 0 1px 0 rgba(255,255,255,0.45)`
            : "0 2px 6px -2px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.4)",
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/25" />
        <span className="relative">{lead.merchant_name.trim().charAt(0).toUpperCase() || "?"}</span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--foreground)] truncate max-w-[180px]">
            {lead.merchant_name}
          </span>
          {lead.is_draft && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Pencil className="h-2.5 w-2.5" /> Draft
            </span>
          )}
        </div>
        {lead.management_name && (
          <div className="text-xs text-[var(--muted)] truncate max-w-[220px]">{lead.management_name}</div>
        )}
      </div>
    </div>
  );
}

function DateAddedCell({ iso }: { iso: string }) {
  const added = formatAdded(iso);
  return (
    <>
      <div className="text-xs font-medium text-[var(--foreground)]">{added.date}</div>
      <div className="text-[10px] text-[var(--muted)]">{added.rel}</div>
    </>
  );
}

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#FF8899] to-[#A78BFA]"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: Lead["status"] }) {
  const cfg = LEAD_STATUS_CONFIG[status];
  const ui = LEAD_STATUS_UI[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
      style={{ backgroundColor: ui.soft, color: ui.solid }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ui.solid }} />
      {cfg.label}
    </span>
  );
}

function PriorityCell({ priority }: { priority: Lead["priority"] }) {
  const cfg = LEAD_PRIORITY_CONFIG[priority];
  const color = LEAD_PRIORITY_UI[priority];
  return (
    <div className="inline-flex items-center gap-1.5" style={{ color }}>
      <span
        className={cn("w-2 h-2 rounded-full", priority === "urgent" && "animate-pulse-soft")}
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-semibold">{cfg.label}</span>
    </div>
  );
}

/**
 * The cell renderer for each configurable column, keyed by the same id as the
 * pure metadata in `lib/leads-table-columns.ts`. Renderers are display-only — all
 * interaction (row navigation, stopPropagation, quick actions) is owned by
 * <LeadsTable> at the <td>/structural level, so reorder/hide can never strip it.
 */
export const LEAD_CELL_RENDERERS: Record<LeadColumnId, (lead: Lead, ctx: LeadCellContext) => ReactNode> = {
  merchant: (lead) => <MerchantCell lead={lead} />,
  added_by: (lead) => <AddedByAvatar user={lead.created_by_user} addedAt={lead.created_at} />,
  date_added: (lead) => <DateAddedCell iso={lead.created_at} />,
  platform: (lead) => <PlatformChip platform={lead.platform} />,
  industry: (lead) => <IndustryChip industry={lead.industry} />,
  followers: (lead) => (
    <span className="font-semibold tabular-nums">{lead.follower_count.toLocaleString()}</span>
  ),
  ranking: (lead) => <TierChip tier={lead.tier} />,
  score: (lead) => <ScoreCell value={lead.lead_score} />,
  est_orders: (lead) => (
    <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
      ~{lead.estimated_daily_orders}/d
    </span>
  ),
  status: (lead) => <StatusPill status={lead.status} />,
  priority: (lead) => <PriorityCell priority={lead.priority} />,
};
