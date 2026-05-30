"use client";

import { useRef } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { AdminTenant, SortConfig } from "@/types/admin";
import {
  ArrowUp,
  ArrowDown,
  Star,
  Heart,
  MapPin,
} from "lucide-react";
import { CopyableText } from "@/components/shared/copyable-text";

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount);
}

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
  const bal = m.wallet?.balance_iqd ?? 0;
  if (bal > 50000) score += 15;
  else if (bal > 10000) score += 5;
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

interface SheetColumn {
  id: string;
  label: string;
  width: string;
  align: string;
  sticky?: boolean;
}

const SHEET_COLUMNS: SheetColumn[] = [
  { id: "row", label: "#", width: "w-12", align: "text-center" },
  { id: "business", label: "Business", width: "min-w-[220px]", align: "text-left", sticky: true },
  { id: "slug", label: "Slug", width: "min-w-[130px]", align: "text-left" },
  { id: "plan", label: "Plan", width: "w-28", align: "text-center" },
  { id: "status", label: "Status", width: "w-28", align: "text-center" },
  { id: "city", label: "City", width: "min-w-[110px]", align: "text-left" },
  { id: "email", label: "Email", width: "min-w-[200px]", align: "text-left" },
  { id: "phone", label: "Phone", width: "min-w-[140px]", align: "text-left" },
  { id: "balance", label: "Balance", width: "min-w-[110px]", align: "text-right" },
  { id: "charged", label: "Charged", width: "min-w-[110px]", align: "text-right" },
  { id: "topped_up", label: "Topped Up", width: "min-w-[120px]", align: "text-right" },
  { id: "orders", label: "Orders", width: "w-20", align: "text-right" },
  { id: "team", label: "Team", width: "w-16", align: "text-right" },
  { id: "health", label: "Health", width: "w-24", align: "text-center" },
  { id: "revenue", label: "Revenue/mo", width: "min-w-[120px]", align: "text-right" },
  { id: "lastActive", label: "Last Active", width: "min-w-[110px]", align: "text-left" },
  { id: "tags", label: "Tags", width: "min-w-[160px]", align: "text-left" },
  { id: "created", label: "Created", width: "min-w-[110px]", align: "text-left" },
];

const ROW_HEIGHT = 44;

interface MerchantSheetViewProps {
  merchants: AdminTenant[];
  sortConfig: SortConfig[];
  selectedMerchants: Set<string>;
  starredMerchants: string[];
  onToggleSelect: (id: string) => void;
  onToggleSort: (column: string, append?: boolean) => void;
  onToggleStar: (id: string) => void;
  onOpenDetail: (id: string) => void;
  onSelectWithShift: (index: number, shiftKey: boolean) => void;
}

export function MerchantSheetView({
  merchants,
  sortConfig,
  selectedMerchants,
  starredMerchants,
  onToggleSelect,
  onToggleSort,
  onToggleStar,
  onOpenDetail,
  onSelectWithShift,
}: MerchantSheetViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const starredSet = new Set(starredMerchants);

  const virtualizer = useWindowVirtualizer({
    count: merchants.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const getSortDir = (col: string) => {
    const s = sortConfig.find((c) => c.column === col);
    return s?.direction ?? null;
  };

  return (
    <div ref={listRef} className="pastel-card overflow-hidden">
      <div className="overflow-x-auto">
        <div className="sticky top-0 z-10 bg-[var(--card-bg)]/95 backdrop-blur-md border-b border-[var(--card-border)] flex items-center min-w-max">
          <div className="w-10 shrink-0 px-2 py-2.5" />
          <div className="w-8 shrink-0 px-1 py-2.5" />

          {SHEET_COLUMNS.map((col) => {
            const dir = getSortDir(col.id);
            return (
              <div
                key={col.id}
                onClick={(e) => col.id !== "row" && onToggleSort(col.id, e.shiftKey)}
                className={cn(
                  "shrink-0 px-2 py-2.5 text-[9px] font-black text-foreground/45 uppercase tracking-[0.1em] select-none flex items-center gap-1 border-r border-[var(--card-border)]/50 transition-colors",
                  col.width,
                  col.align === "text-right" && "justify-end",
                  col.align === "text-center" && "justify-center",
                  col.id !== "row" && "cursor-pointer hover:text-foreground/80",
                  col.sticky && "sticky left-[72px] z-20 bg-[var(--card-bg)]/95 backdrop-blur-md",
                )}
              >
                <span>{col.label}</span>
                {dir === "asc" && <ArrowUp className="w-2.5 h-2.5 text-foreground" />}
                {dir === "desc" && <ArrowDown className="w-2.5 h-2.5 text-foreground" />}
              </div>
            );
          })}
        </div>

        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const m = merchants[virtualRow.index];
            if (!m) return null;
            const isSelected = selectedMerchants.has(m.id);
            const isStarred = starredSet.has(m.id);
            const healthScore = calculateHealthScore(m);
            const logoBg = m.branding?.primary_color || "#1E1E1E";

            return (
              <div
                key={m.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={cn(
                  "absolute left-0 w-full flex items-center min-w-max border-b border-[var(--card-border)]/50 transition-colors text-[11px]",
                  isSelected
                    ? "bg-[var(--primary)]/[0.04] ring-2 ring-inset ring-[var(--primary)]"
                    : "hover:bg-foreground/[0.025]",
                  virtualRow.index % 2 === 1 && !isSelected && "bg-foreground/[0.012]",
                )}
                style={{
                  top: 0,
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  height: ROW_HEIGHT,
                }}
              >
                <div className="w-10 shrink-0 px-2 flex items-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(m.id)}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        e.preventDefault();
                        onSelectWithShift(virtualRow.index, true);
                      }
                    }}
                    className="w-3.5 h-3.5 rounded border-[var(--card-border)] accent-[var(--primary)] cursor-pointer"
                  />
                </div>

                <div className="w-8 shrink-0 px-1 flex items-center">
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
                          : "text-foreground/20 hover:text-foreground/40",
                      )}
                    />
                  </button>
                </div>

                <div className="w-12 shrink-0 px-2 text-center text-foreground/30 tabular-nums font-bold">
                  {virtualRow.index + 1}
                </div>

                <div className="min-w-[220px] shrink-0 px-2 sticky left-[72px] z-10 bg-inherit flex items-center gap-2 border-r border-[var(--card-border)]/30">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-[10px] shrink-0 ring-1 ring-black/5 shadow-sm"
                    style={{ backgroundColor: logoBg }}
                  >
                    {m.business_name.charAt(0).toUpperCase()}
                  </div>
                  <button
                    onClick={() => onOpenDetail(m.id)}
                    className="font-black text-foreground tracking-tight truncate hover:underline text-left text-[12px] leading-tight"
                  >
                    {m.business_name}
                  </button>
                </div>

                <div className="min-w-[130px] shrink-0 px-2 truncate border-r border-[var(--card-border)]/30 flex items-center">
                  <CopyableText
                    value={m.slug}
                    className="text-[11px] text-foreground/50 max-w-full"
                  />
                </div>

                <div className="w-28 shrink-0 px-2 flex items-center justify-center border-r border-[var(--card-border)]/30">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider w-fit",
                      PLAN_PILL[m.plan],
                    )}
                  >
                    {PLAN_LABEL[m.plan] ?? m.plan}
                  </span>
                </div>

                <div className="w-28 shrink-0 px-2 flex items-center justify-center border-r border-[var(--card-border)]/30">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit",
                      STATUS_PILL[m.status],
                    )}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
                    {m.status}
                  </span>
                </div>

                <div className="min-w-[110px] shrink-0 px-2 flex items-center gap-1 border-r border-[var(--card-border)]/30">
                  {m.city ? (
                    <span className="text-foreground/70 flex items-center gap-1 truncate font-medium">
                      <MapPin className="w-2.5 h-2.5 shrink-0 text-foreground/30" />
                      {m.city}
                    </span>
                  ) : (
                    <span className="text-foreground/25">—</span>
                  )}
                </div>

                <div className="min-w-[200px] shrink-0 px-2 truncate border-r border-[var(--card-border)]/30 flex items-center">
                  {m.contact_email ? (
                    <CopyableText
                      value={m.contact_email}
                      className="text-[11px] text-foreground/55 max-w-full"
                    />
                  ) : (
                    <span className="text-foreground/25">—</span>
                  )}
                </div>

                <div className="min-w-[140px] shrink-0 px-2 truncate border-r border-[var(--card-border)]/30 flex items-center">
                  {m.contact_phone ? (
                    <CopyableText
                      value={m.contact_phone}
                      className="text-[11px] text-foreground/55 tabular-nums max-w-full"
                    />
                  ) : (
                    <span className="text-foreground/25">—</span>
                  )}
                </div>

                <div className="min-w-[110px] shrink-0 px-2 flex items-center justify-end border-r border-[var(--card-border)]/30">
                  <span className="font-black tabular-nums text-foreground text-[12px]">
                    {formatCompactIQD(m.wallet?.balance_iqd ?? 0)}
                    <span className="text-[9px] font-bold text-foreground/40 ml-1">IQD</span>
                  </span>
                </div>

                <div className="min-w-[110px] shrink-0 px-2 flex items-center justify-end text-foreground/55 tabular-nums font-bold border-r border-[var(--card-border)]/30">
                  {formatCompactIQD(m.wallet?.total_charged_iqd ?? 0)}
                </div>

                <div className="min-w-[120px] shrink-0 px-2 flex items-center justify-end text-foreground/55 tabular-nums font-bold border-r border-[var(--card-border)]/30">
                  {formatCompactIQD(m.wallet?.total_topped_up_iqd ?? 0)}
                </div>

                <div className="w-20 shrink-0 px-2 flex items-center justify-end font-black tabular-nums text-foreground border-r border-[var(--card-border)]/30">
                  {m.usage?.orders_count ?? 0}
                </div>

                <div className="w-16 shrink-0 px-2 flex items-center justify-end font-bold tabular-nums text-foreground/70 border-r border-[var(--card-border)]/30">
                  {m.usage?.team_members_count ?? 0}
                </div>

                <div className="w-24 shrink-0 px-2 flex items-center justify-center border-r border-[var(--card-border)]/30">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums",
                      getHealthColor(healthScore),
                    )}
                  >
                    <Heart className="w-2.5 h-2.5" />
                    {healthScore}
                  </span>
                </div>

                <div className="min-w-[120px] shrink-0 px-2 flex items-center justify-end tabular-nums text-foreground/85 font-black border-r border-[var(--card-border)]/30">
                  {formatCompactIQD(m.monthly_revenue ?? 0)}
                  <span className="text-[9px] font-bold text-foreground/40 ml-1">/mo</span>
                </div>

                <div className="min-w-[110px] shrink-0 px-2 flex items-center text-foreground/55 text-[10px] font-medium border-r border-[var(--card-border)]/30">
                  {m.last_active_at ? timeAgo(m.last_active_at) : <span className="text-foreground/25">—</span>}
                </div>

                <div className="min-w-[160px] shrink-0 px-2 flex items-center gap-1 border-r border-[var(--card-border)]/30">
                  {m.tags && m.tags.length > 0 ? (
                    <>
                      {m.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-[9px] font-bold text-foreground/65 truncate max-w-[70px]"
                        >
                          {t}
                        </span>
                      ))}
                      {m.tags.length > 2 && (
                        <span className="text-[9px] text-foreground/40 font-bold">
                          +{m.tags.length - 2}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-foreground/25">—</span>
                  )}
                </div>

                <div className="min-w-[110px] shrink-0 px-2 flex items-center text-foreground/45 text-[10px] font-medium tabular-nums">
                  {new Date(m.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "2-digit",
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
