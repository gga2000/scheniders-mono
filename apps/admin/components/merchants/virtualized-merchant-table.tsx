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

// ── Density config ─────────────────────────────────────────────────────
const DENSITY_CONFIG: Record<TableDensity, { rowHeight: number; cellPy: string; fontSize: string }> = {
  compact: { rowHeight: 48, cellPy: "py-1.5", fontSize: "text-[11px]" },
  comfortable: { rowHeight: 64, cellPy: "py-2.5", fontSize: "text-xs" },
  spacious: { rowHeight: 80, cellPy: "py-3.5", fontSize: "text-xs" },
};

// ── Helpers ────────────────────────────────────────────────────────────
function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount);
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
  if (score >= 70) return "text-green-600 bg-green-100 dark:bg-green-400/15 dark:text-green-400";
  if (score >= 40) return "text-amber-600 bg-amber-100 dark:bg-amber-400/15 dark:text-amber-400";
  return "text-red-600 bg-red-100 dark:bg-red-400/15 dark:text-red-400";
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

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300",
  trial: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  suspended: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-400/15 dark:text-gray-400",
};

const PLAN_STYLES: Record<string, string> = {
  starter: "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300",
  growth: "bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300",
  professional: "bg-purple-100 text-purple-800 dark:bg-purple-400/15 dark:text-purple-300",
  enterprise: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
};

// ── Props ──────────────────────────────────────────────────────────────
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

  // Filter columns by visibility and order
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

  // Column header sort click
  const handleHeaderClick = (col: string, e: React.MouseEvent) => {
    onToggleSort(col, e.shiftKey);
  };

  return (
    <div ref={listRef} className="pastel-card overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--card-bg)] border-b border-[var(--card-border)]">
        <div className="flex items-center">
          {/* Checkbox column */}
          <div className="w-10 shrink-0 px-3 py-2.5" />

          {/* Star column */}
          <div className="w-10 shrink-0 px-1 py-2.5" />

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
                  "flex-1 min-w-0 px-3 py-2.5 text-[10px] font-semibold text-foreground/50 uppercase tracking-wider cursor-pointer select-none hover:text-foreground/80 transition-colors flex items-center gap-1",
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
                      <span className="text-[8px] font-bold text-foreground/60 bg-foreground/10 rounded-full w-3.5 h-3.5 flex items-center justify-center">
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

      {/* Rows */}
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
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
                "absolute left-0 w-full flex items-center border-b border-[var(--card-border)] transition-colors",
                isSelected && "bg-[var(--primary)]/[0.04]",
                isFocused && "ring-2 ring-inset ring-[var(--primary)]/30",
                !isSelected && !isFocused && "hover:bg-foreground/[0.02]",
              )}
              style={{
                top: 0,
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                height: cfg.rowHeight,
              }}
            >
              {/* Checkbox */}
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
                  className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--primary)]"
                />
              </div>

              {/* Star */}
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

              {/* Dynamic columns */}
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

// ── Cell renderer ──────────────────────────────────────────────────────
function renderCell(
  colId: string,
  m: AdminTenant,
  healthScore: number,
  churn: boolean,
  onOpenDetail: (id: string) => void,
): React.ReactNode {
  switch (colId) {
    case "business":
      return (
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-[10px] shrink-0"
            style={{ backgroundColor: m.branding?.primary_color || "#1E1E1E" }}
          >
            {m.business_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <button
              onClick={() => onOpenDetail(m.id)}
              className="font-semibold text-foreground truncate block hover:underline text-left"
            >
              {m.business_name}
            </button>
            <p className="text-[10px] text-foreground/40 truncate">{m.contact_email || m.slug}</p>
          </div>
        </div>
      );

    case "plan":
      return (
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", PLAN_STYLES[m.plan])}>
          {m.plan}
        </span>
      );

    case "status":
      return (
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize flex items-center gap-1 w-fit", STATUS_STYLES[m.status])}>
          {m.status}
        </span>
      );

    case "city":
      return (
        <span className="text-foreground/70 flex items-center gap-1 truncate">
          {m.city ? (
            <>
              <MapPin className="w-3 h-3 shrink-0 text-foreground/30" />
              {m.city}
            </>
          ) : (
            "\u2014"
          )}
        </span>
      );

    case "balance":
      return (
        <span className="font-medium tabular-nums">
          {formatIQD(m.wallet?.balance_iqd ?? 0)}
        </span>
      );

    case "orders":
      return (
        <span className="text-foreground/70 tabular-nums">
          {m.usage?.orders_count ?? 0}
        </span>
      );

    case "health":
      return (
        <span className="flex items-center gap-1 justify-end">
          {churn && <Flame className="w-3 h-3 text-red-500" />}
          <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold", getHealthColor(healthScore))}>
            <Heart className="w-2.5 h-2.5" />
            {healthScore}
          </span>
        </span>
      );

    case "revenue":
      return (
        <span className="font-medium tabular-nums text-foreground/70">
          {formatIQD(m.monthly_revenue ?? 0)}
        </span>
      );

    case "lastActive":
      return (
        <span className="text-foreground/50 text-[10px]">
          {m.last_active_at ? timeAgo(m.last_active_at) : "\u2014"}
        </span>
      );

    case "tags":
      if (!m.tags || m.tags.length === 0) return <span className="text-foreground/20">\u2014</span>;
      return (
        <div className="flex items-center gap-1 flex-wrap">
          {m.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-[9px] font-medium text-foreground/60 truncate max-w-[80px]">
              {tag}
            </span>
          ))}
          {m.tags.length > 3 && (
            <span className="text-[9px] text-foreground/40">+{m.tags.length - 3}</span>
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
          className="p-1 rounded-md text-foreground/40 hover:text-foreground/70 hover:bg-foreground/5 transition-colors"
          aria-label="View details"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      );

    default:
      return null;
  }
}

// ── Time ago helper ────────────────────────────────────────────────────
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

// ── Mini sparkline (SVG) ───────────────────────────────────────────────
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

  return (
    <svg width={w} height={h} className="shrink-0" viewBox={`0 0 ${w} ${h}`}>
      <polyline
        fill="none"
        stroke={trend ? "rgb(34 197 94)" : "rgb(239 68 68)"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}
