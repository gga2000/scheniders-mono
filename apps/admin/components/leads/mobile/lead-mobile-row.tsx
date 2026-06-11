"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/leads";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_UI, LEAD_PRIORITY_UI, LEAD_TIER_CONFIG, PLATFORM_CONFIG } from "@/types/leads";

function compactFollowers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

interface LeadMobileRowProps {
  lead: Lead;
  /** Open the advance-stage sheet for this lead. */
  onStatusTap: (lead: Lead) => void;
  /** Resume editing an in-progress draft (instead of opening its detail page). */
  onResumeDraft?: (lead: Lead) => void;
}

export function LeadMobileRow({ lead, onStatusTap, onResumeDraft }: LeadMobileRowProps) {
  const router = useRouter();
  const tier = LEAD_TIER_CONFIG[lead.tier];
  const statusCfg = LEAD_STATUS_CONFIG[lead.status];
  const statusUi = LEAD_STATUS_UI[lead.status];
  const platform = PLATFORM_CONFIG[lead.platform];
  const priorityColor = LEAD_PRIORITY_UI[lead.priority];

  return (
    <div
      onClick={() =>
        lead.is_draft && onResumeDraft ? onResumeDraft(lead) : router.push(`/leads/${lead.id}`)
      }
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition-transform active:scale-[0.99]",
        lead.is_draft
          ? "border-2 border-dashed border-amber-400/60 bg-amber-50/60 dark:bg-amber-500/[0.06]"
          : "border border-[var(--card-border)] bg-[var(--card-bg)]",
      )}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold"
        style={{ backgroundColor: `${tier.color}1A`, color: tier.color, border: `1px solid ${tier.color}40` }}
      >
        {lead.merchant_name.trim().charAt(0).toUpperCase() || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-[var(--foreground)]">{lead.merchant_name}</span>
          {lead.is_draft && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Pencil className="h-2.5 w-2.5" /> Draft
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
          <span style={{ color: platform.color }}>{platform.label}</span>
          {" · "}{compactFollowers(lead.follower_count)}
          {" · "}<span style={{ color: tier.color }}>{tier.label}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onStatusTap(lead); }}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold"
          style={{ backgroundColor: statusUi.soft, color: statusUi.solid }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusUi.solid }} />
          {statusCfg.label}
        </button>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: priorityColor }} />
      </div>
    </div>
  );
}
