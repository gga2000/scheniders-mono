"use client";

import type { ReactNode } from "react";
import type { Lead } from "@/types/leads";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_PRIORITY_CONFIG,
  LEAD_PRIORITY_UI,
  LEAD_TIER_UI,
} from "@/types/leads";
import { PlatformChip, IndustryChip, TierChip } from "@/components/leads/lead-chips";
import { AddedByAvatar } from "@/components/leads/added-by-avatar";
import type { LeadColumnId } from "@/lib/leads-table-columns";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { formatDay, formatWhen } from "@/lib/format";

/** Extra inputs a cell may need beyond the Lead. Built once per render by <LeadsTable>. */
export interface LeadCellContext {
  onQuickCall: (lead: Lead) => void;
  onQuickWhatsApp: (lead: Lead) => void;
}


// ── Presentational cells (inner <td> content only; the row owns the <td> + click) ──

function MerchantCell({ lead }: { lead: Lead }) {
  const tierUi = LEAD_TIER_UI[lead.tier];
  return (
    <div className="flex items-center gap-3">
      {/* The first letter on the tier's soft colour, one flat fill (board v6). */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
        style={{ backgroundColor: tierUi.soft, color: tierUi.solid }}
      >
        {lead.merchant_name.trim().charAt(0).toUpperCase() || "?"}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[var(--foreground)] truncate name-dir max-w-[180px]" title={lead.merchant_name}>
            {lead.merchant_name}
          </span>
          {lead.is_draft && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--ink-amber)]">
              <Pencil className="h-2.5 w-2.5" /> Draft
            </span>
          )}
        </div>
        {lead.management_name && (
          <div className="text-xs text-[var(--muted)] truncate max-w-[220px]" title={lead.management_name}>{lead.management_name}</div>
        )}
      </div>
    </div>
  );
}

/** The day a lead was added ("Sun 15 Nov"), and "5 h ago" under it while that day is recent. */
function DateAddedCell({ iso }: { iso: string }) {
  const day = formatDay(iso);
  const when = formatWhen(iso);
  return (
    <>
      <div className="text-xs font-medium text-[var(--foreground)]">{day}</div>
      {when !== day && <div className="text-xs text-[var(--muted)]">{when}</div>}
    </>
  );
}

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground/70"
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
    // Subtle tint by tier/rank — diamonds/legendaries read hotter at a glance.
    <span className="font-semibold tabular-nums" style={{ color: LEAD_TIER_UI[lead.tier].solid }}>
      {lead.follower_count.toLocaleString()}
    </span>
  ),
  ranking: (lead) => <TierChip tier={lead.tier} />,
  score: (lead) => <ScoreCell value={lead.lead_score} />,
  est_orders: (lead) => (
    <span className="font-semibold text-[var(--ink-green)] tabular-nums">
      ~{lead.estimated_daily_orders}/d
    </span>
  ),
  status: (lead) => <StatusPill status={lead.status} />,
  priority: (lead) => <PriorityCell priority={lead.priority} />,
};
