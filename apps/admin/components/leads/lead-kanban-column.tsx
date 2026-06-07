"use client";

import { cn } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/types/leads";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
} from "@/types/leads";
import { GripVertical, Users } from "lucide-react";

// ── Kanban Card (compact inline card for kanban view) ──────────────────

function KanbanCard({
  lead,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  lead: Lead;
  onDragStart: (leadId: string, status: LeadStatus) => void;
  onDragEnd: () => void;
  onClick: (leadId: string) => void;
}) {
  const tierConfig = LEAD_TIER_CONFIG[lead.tier];
  const priorityConfig = LEAD_PRIORITY_CONFIG[lead.priority];
  const platformConfig = PLATFORM_CONFIG[lead.platform];

  const formattedFollowers =
    lead.follower_count >= 1000
      ? `${(lead.follower_count / 1000).toFixed(lead.follower_count >= 10000 ? 0 : 1)}K`
      : String(lead.follower_count);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/lead-id", lead.id);
        e.dataTransfer.setData("text/lead-status", lead.status);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(lead.id, lead.status);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(lead.id)}
      className={cn(
        "group/card relative rounded-xl p-3 cursor-grab active:cursor-grabbing",
        "bg-[var(--card-bg)] border border-[var(--card-border)]",
        "hover:border-[color-mix(in_srgb,var(--card-border),var(--foreground)_20%)]",
        "shadow-sm hover:shadow-md transition-all duration-200",
        "active:shadow-lg active:scale-[0.98]"
      )}
    >
      {/* Drag handle hint */}
      <div className="absolute top-2.5 right-2 opacity-0 group-hover/card:opacity-40 transition-opacity">
        <GripVertical className="w-3.5 h-3.5 text-[var(--muted)]" />
      </div>

      {/* Merchant name */}
      <h4 className="font-semibold text-sm text-[var(--foreground)] truncate pr-5 mb-1.5">
        {lead.merchant_name}
      </h4>

      {/* Platform + Tier dot row */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{
            backgroundColor: `${platformConfig.color}15`,
            color: platformConfig.color,
          }}
        >
          {platformConfig.label}
        </span>
        <div className="flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: tierConfig.color }}
            title={tierConfig.label}
          />
          <span className="text-[10px] text-[var(--muted)]">{tierConfig.label}</span>
        </div>
      </div>

      {/* Followers row */}
      <div className="flex items-center gap-1 mb-2 text-xs text-[var(--muted)]">
        <Users className="w-3 h-3" />
        <span className="font-medium text-[var(--foreground)]">{formattedFollowers}</span>
        <span>followers</span>
      </div>

      {/* Score bar (thin) */}
      <div className="mb-1.5">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] text-[var(--muted)] uppercase tracking-wider">
            Score
          </span>
          <span
            className="text-[10px] font-bold"
            style={{ color: tierConfig.color }}
          >
            {lead.lead_score}
          </span>
        </div>
        <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${lead.lead_score}%`,
              backgroundColor: tierConfig.color,
            }}
          />
        </div>
      </div>

      {/* Priority indicator */}
      <div className="flex items-center gap-1.5 mt-2">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: priorityConfig.color }}
        />
        <span className="text-[10px] text-[var(--muted)]">
          {priorityConfig.label} priority
        </span>
      </div>
    </div>
  );
}

// ── Column Component ───────────────────────────────────────────────────

export interface LeadKanbanColumnProps {
  status: LeadStatus;
  leads: Lead[];
  isDropTarget: boolean;
  isValidTarget: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onLeadClick: (leadId: string) => void;
  onDragStart: (leadId: string, status: LeadStatus) => void;
  onDragEnd: () => void;
}

export function LeadKanbanColumn({
  status,
  leads,
  isDropTarget,
  isValidTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onLeadClick,
  onDragStart,
  onDragEnd,
}: LeadKanbanColumnProps) {
  const config = LEAD_STATUS_CONFIG[status];
  const ui = LEAD_STATUS_UI[status];

  return (
    <div
      className={cn(
        "flex flex-col w-[280px] min-w-[280px] flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200",
        "bg-[color-mix(in_srgb,var(--card-bg),transparent_30%)]",
        "border border-[var(--card-border)]",
        isDropTarget && isValidTarget && "ring-2 ring-[var(--primary)] border-[var(--primary)] shadow-[0_0_20px_rgba(var(--primary-rgb,99,102,241),0.15)]",
        isDropTarget && !isValidTarget && "ring-2 ring-red-500 border-red-500"
      )}
      style={{
        borderTopColor: ui.solid,
        borderTopWidth: "3px",
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--card-border)]">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: ui.solid }}
        />
        <span className="text-sm font-semibold text-[var(--foreground)] truncate">
          {config.label}
        </span>
        <span
          className="ml-auto flex-shrink-0 min-w-[22px] h-[22px] flex items-center justify-center rounded-full text-[11px] font-bold"
          style={{ backgroundColor: ui.soft, color: ui.solid }}
        >
          {leads.length}
        </span>
      </div>

      {/* Card list */}
      <div className="relative flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-240px)]">
        {/* Drop target overlay */}
        {isDropTarget && (
          <div
            className={cn(
              "absolute inset-0 z-10 flex items-center justify-center rounded-b-xl pointer-events-none",
              isValidTarget
                ? "bg-[var(--primary)]/[0.06]"
                : "bg-red-500/[0.06]"
            )}
          >
            <div
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold",
                isValidTarget
                  ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                  : "bg-red-500 text-white"
              )}
            >
              {isValidTarget ? "Drop here" : "Invalid transition"}
            </div>
          </div>
        )}

        {leads.length === 0 && !isDropTarget && (
          <div className="flex items-center justify-center h-20 text-xs text-[var(--muted)]">
            No leads
          </div>
        )}

        {leads.map((lead) => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onLeadClick}
          />
        ))}
      </div>
    </div>
  );
}
