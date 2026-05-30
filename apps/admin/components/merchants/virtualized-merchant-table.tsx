"use client";

import { useRef, useCallback } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { AdminTenant, TableDensity, MerchantColumnId, SortConfig } from "@/types/admin";
import { MERCHANT_COLUMNS } from "@/types/admin";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Star,
  ExternalLink,
  MapPin,
  Heart,
  Flame,
} from "lucide-react";
import { CopyableText } from "@/components/shared/copyable-text";

const DENSITY_CONFIG: Record<TableDensity, { rowHeight: number; cellPy: string; fontSize: string }> = {
  compact: { rowHeight: 52, cellPy: "py-1.5", fontSize: "text-[11px]" },
  comfortable: { rowHeight: 68, cellPy: "py-2.5", fontSize: "text-xs" },
  spacious: { rowHeight: 84, cellPy: "py-3.5", fontSize: "text-xs" },
};

function formatCompactIQD(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return String(amount);
}

function calculateHealthScore(m: AdminTenant): number {
  let score = 50;
  if (m.status === "active") score += 15;
  else if (m.status === "trial") score += 5;
  else if (m.status === "suspended") score -= 20;
  const balance = m.wallet?.balance_iqd ?? 0;
  if (balance > 50000) score += 15;
  else if (balance > 10000) score += 5;
  else score -= 10;
  const orders = m.usage?.orders_count ?? 0;
  if (orders > 50) score += 15;
  else if (orders > 10) score += 10;
  else if (orders > 0) score += 5;
  if (m.plan === "enterprise") score += 5;
  else if (m.plan === "professional") score += 3;
  return Math.max(0, Math.min(100, score));
}

function getHealthColor(score: number): string {
  if (score >= 70) return "text-emerald-700 bg-emerald-100 dark:bg-emerald-400/15 dark:text-emerald-300";
  if (score >= 40) return "text-amber-700 bg-amber-100 dark:bg-amber-400/15 dark:text-amber-300";
  return "text-rose-700 bg-rose-100 dark:bg-rose-400/15 dark:text-rose-300";
}

function isChurnRisk(m: AdminTenant): boolean {
  const balance = m.wallet?.balance_iqd ?? 0;
  const orders = m.usage?.orders_count ?? 0;
  if (m.status === "suspended") return true;
  if (balance < 5000 && orders < 5) return true;
  if (m.status === "trial") {
    if (!m.trial_ends_at) return false;
    const days = Math.ceil((new Date(m.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days <= 3 && orders === 0) return true;
  }
  return false;
}

const STATUS_PILL: Record<string, string> = {
  active:
    "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20",
  trial:
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20",
  limited:
    "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-sm shadow-yellow-500/30 ring-1 ring-white/20",
  suspended:
    "bg-gradient-to-br from-rose-500 to-red-500 text-white shadow-sm shadow-rose-500/30 ring-1 ring-white/20",
  cancelled:
    "bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm shadow-slate-500/30 ring-1 ring-white/20",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-white/90",
  trial: "bg-white/90",
  limited: "bg-white/90",
  suspended: "bg-white/90",
  cancelled: "bg-white/80",
};

const PLAN_PILL: Record<string, string> = {
  starter:
    "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shadow-sky-500/30 ring-1 ring-white/20",
  growth:
    "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20",
  professional:
    "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
  enterprise:
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20",
};

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  professional: "Pro",
  enterprise: "Enterprise",
};

interface VirtualizedMerchantTableProps {
  merchants: AdminTenant[];
  density: TableDensity;
  hiddenColumns: string[];
  columnOrder: MerchantColumnId[];
  sortConfig: SortConfig[];
  selectedMerchants: Set<string>;
  starredMerchants: string[];
  focusedIndex: number | null;
  onToggleSelect: (id: string) => void;
  onToggleSort: (column: string, append?: boolean) => void;
  onToggleStar: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onSelectWithShift: (index: number, shiftKey: boolean) => void;
}

export function VirtualizedMerchantTable({
  merchants,
  density,
  hiddenColumns,
  columnOrder,
  sortConfig,
  selectedMerchants,
  starredMerchants,
  focusedIndex,
  onToggleSelect,
  onToggleSort,
  onToggleStar,
  onOpenDetail,
  onSelectWithShift,
}: VirtualizedMerchantTableProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const cfg = DENSITY_CONFIG[density];
  const hiddenSet = new Set(hiddenColumns);
  const starredSet = new Set(starredMerchants);

  const visibleColumns = columnOrder.filter((id) => !hiddenSet.has(id));

  const virtualizer = useWindowVirtualizer({
    count: merchants.length,
    estimateSize: () => cfg.rowHeight,
    overscan: 10,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const getSortInfo = useCallback((column: string) => {
    const idx = sortConfig.findIndex((s) => s.column === column);
    if (idx === -1) return null;
    return { direction: sortConfig[idx].direction, rank: sortConfig.length > 1 ? idx + 1 : null };
  }, [sortConfig]);

  const handleHeaderClick = (col: string, e: React.MouseEvent) => {
    onToggleSort(col, e.shiftKey);
  };

  return (
    <div ref={listRef} className="pastel-card overflow-hidden">
      <div className="sticky top-0 z-10 bg-[var(--card-bg)]/95 backdrop-blur-md border-b border-[var(--card-border)]">
        <div className="flex items-center">
          <div className="w-10 shrink-0 px-3 py-3" />
          <div className="w-10 shrink-0 px-1 py-3" />

          {visibleColumns.map((colId) => {
            const colDef = MERCHANT_COLUMNS.find((c) => c.id === colId);
            if (!colDef) return null;
            const sortInfo = getSortInfo(colId);
            const isNumeric = ["balance", "orders", "health", "revenue"].includes(colId);

            return (
              <div
                key={colId}
                onClick={(e) => handleHeaderClick(colId, e)}
                className={cn(
                  "flex-1 min-w-0 px-3 py-3 text-[9px] font-black text-foreground/45 uppercase tracking-[0.1em] cursor-pointer select-none hover:text-foreground/80 transition-colors flex items-center gap-1",
                  isNumeric && "justify-end",
                  colId === "business" && "flex-[2]",
                  colId === "tags" && "flex-[1.5]",
                )}
              >
                <span>{colDef.label}</span>
                {sortInfo ? (
                  <span className="flex items-center gap-0.5">
                    {sortInfo.direction === "asc" ? (
                      <ArrowUp className="w-3 h-3 text-foreground" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-foreground" />
                    )}
                    {sortInfo.rank && (
                      <span className="text-[8px] font-black text-foreground/60 bg-foreground/10 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                        {sortInfo.rank}
                      </span>
                    )}
                  </span>
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-30" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const m = merchants[virtualRow.index];
          if (!m) return null;
          const isSelected = selectedMerchants.has(m.id);
          const isStarred = starredSet.has(m.id);
          const isFocused = focusedIndex === virtualRow.index;
          const healthScore = calculateHealthScore(m);
          const churn = isChurnRisk(m);

          return (
            <div
              key={m.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className={cn(
                "absolute left-0 w-full flex items-center border-b border-[var(--card-border)]/60 transition-colors",
                isSelected && "bg-[var(--primary)]/[0.04] ring-2 ring-inset ring-[var(--primary)]",
                isFocused && !isSelected && "ring-2 ring-inset ring-[var(--primary)]/40",
                !isSelected && !isFocused && "hover:bg-foreground/[0.025]",
              )}
              style={{
                top: 0,
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                height: cfg.rowHeight,
              }}
            >
              <div className={cn("w-10 shrink-0 px-3", cfg.cellPy)}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelectWithShift(virtualRow.index, false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      e.preventDefault();
                      onSelectWithShift(virtualRow.index, true);
                    }
                  }}
                  className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--primary)] cursor-pointer"
                />
              </div>

              <div className={cn("w-10 shrink-0 px-1", cfg.cellPy)}>
                <button
                  onClick={() => onToggleStar(m.id)}
                  className="p-0.5 rounded transition-colors"
                  aria-label={isStarred ? "Unstar" : "Star"}
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5 transition-colors",
                      isStarred
                        ? "fill-amber-400 text-amber-400"
                        : "text-foreground/20 hover:text-foreground/40"
                    )}
                  />
                </button>
              </div>

              {visibleColumns.map((colId) => {
                const isNumeric = ["balance", "orders", "health", "revenue"].includes(colId);
                return (
                  <div
                    key={colId}
                    className={cn(
                      "flex-1 min-w-0 px-3 flex items-center",
                      cfg.cellPy,
                      cfg.fontSize,
                      isNumeric && "justify-end",
                      colId === "business" && "flex-[2]",
                      colId === "tags" && "flex-[1.5]",
                    )}
                  >
                    {renderCell(colId, m, healthScore, churn, onOpenDetail)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderCell(
  colId: string,
  m: AdminTenant,
  healthScore: number,
  churn: boolean,
  onOpenDetail: (id: string) => void,
): React.ReactNode {
  switch (colId) {
    case "business": {
      const logoBg = m.branding?.primary_color || "#1E1E1E";
      return (
        <div className="flex items-center gap-2.5 min-w-0 w-full">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-[11px] shrink-0 ring-1 ring-black/5 shadow-sm"
            style={{ backgroundColor: logoBg }}
          >
            {m.business_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <button
              onClick={() => onOpenDetail(m.id)}
              className="font-black text-foreground tracking-tight truncate block hover:underline text-left text-[13px] leading-tight"
            >
              {m.business_name}
            </button>
            <div className="text-[10px] text-foreground/50 truncate mt-0.5">
              {m.contact_email ? (
                <CopyableText value={m.contact_email} className="text-[10px] text-foreground/50" />
              ) : (
                <CopyableText value={m.slug} className="text-[10px] text-foreground/50" />
              )}
            </div>
          </div>
        </div>
      );
    }

    case "plan":
      return (
        <span
          className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider w-fit",
            PLAN_PILL[m.plan],
          )}
        >
          {PLAN_LABEL[m.plan] ?? m.plan}
        </span>
      );

    case "status":
      return (
        <span
          className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit",
            STATUS_PILL[m.status],
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[m.status])} />
          {m.status}
        </span>
      );

    case "city":
      return (
        <span className="text-foreground/70 flex items-center gap-1 truncate font-medium">
          {m.city ? (
            <>
              <MapPin className="w-3 h-3 shrink-0 text-foreground/30" />
              {m.city}
            </>
          ) : (
            <span className="text-foreground/25">—</span>
          )}
        </span>
      );

    case "balance": {
      const balance = m.wallet?.balance_iqd ?? 0;
      return (
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
            Balance
          </span>
          <span className="font-black tabular-nums text-foreground text-[13px]">
            {formatCompactIQD(balance)}
            <span className="text-[9px] font-bold text-foreground/40 ml-1">IQD</span>
          </span>
        </div>
      );
    }

    case "orders": {
      const orders = m.usage?.orders_count ?? 0;
      return (
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
            Orders
          </span>
          <span className="font-black tabular-nums text-foreground text-[13px]">
            {orders}
          </span>
        </div>
      );
    }

    case "health":
      return (
        <span className="flex items-center gap-1 justify-end">
          {churn && <Flame className="w-3 h-3 text-rose-500" />}
          <span
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums",
              getHealthColor(healthScore),
            )}
          >
            <Heart className="w-2.5 h-2.5" />
            {healthScore}
          </span>
        </span>
      );

    case "revenue": {
      const rev = m.monthly_revenue ?? 0;
      return (
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
            Revenue
          </span>
          <span className="font-black tabular-nums text-foreground/85 text-[13px]">
            {formatCompactIQD(rev)}
            <span className="text-[9px] font-bold text-foreground/40 ml-1">/mo</span>
          </span>
        </div>
      );
    }

    case "lastActive":
      return (
        <span className="text-foreground/55 text-[10px] font-medium">
          {m.last_active_at ? timeAgo(m.last_active_at) : <span className="text-foreground/25">—</span>}
        </span>
      );

    case "tags":
      if (!m.tags || m.tags.length === 0) {
        return <span className="text-foreground/25">—</span>;
      }
      return (
        <div className="flex items-center gap-1 flex-wrap">
          {m.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-[9px] font-bold text-foreground/65 truncate max-w-[80px]"
            >
              {tag}
            </span>
          ))}
          {m.tags.length > 3 && (
            <span className="text-[9px] text-foreground/40 font-bold">+{m.tags.length - 3}</span>
          )}
        </div>
      );

    case "sparkline":
      if (!m.order_sparkline || m.order_sparkline.length === 0) return null;
      return <MiniSparkline data={m.order_sparkline} />;

    case "actions":
      return (
        <button
          onClick={() => onOpenDetail(m.id)}
          className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
          aria-label="View details"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      );

    default:
      return null;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function MiniSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const w = 64;
  const h = 20;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });

  const trend = data[data.length - 1] >= (data[data.length - 4] ?? 0);
  const stroke = trend ? "rgb(16 185 129)" : "rgb(244 63 94)";

  return (
    <svg width={w} height={h} className="shrink-0 opacity-80" viewBox={`0 0 ${w} ${h}`}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}
