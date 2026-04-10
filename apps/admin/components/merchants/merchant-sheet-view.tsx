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
  Flame,
  MapPin,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────
function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount);
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

// ── Sheet columns ──────────────────────────────────────────────────────
interface SheetColumn {
  id: string;
  label: string;
  width: string;
  align: string;
  sticky?: boolean;
}

const SHEET_COLUMNS: SheetColumn[] = [
  { id: "row", label: "#", width: "w-12", align: "text-center" },
  { id: "business", label: "Business Name", width: "min-w-[200px]", align: "text-left", sticky: true },
  { id: "slug", label: "Slug", width: "min-w-[120px]", align: "text-left" },
  { id: "plan", label: "Plan", width: "w-24", align: "text-center" },
  { id: "status", label: "Status", width: "w-24", align: "text-center" },
  { id: "city", label: "City", width: "min-w-[100px]", align: "text-left" },
  { id: "email", label: "Email", width: "min-w-[180px]", align: "text-left" },
  { id: "phone", label: "Phone", width: "min-w-[120px]", align: "text-left" },
  { id: "balance", label: "Balance (IQD)", width: "min-w-[120px]", align: "text-right" },
  { id: "charged", label: "Charged (IQD)", width: "min-w-[120px]", align: "text-right" },
  { id: "topped_up", label: "Topped Up (IQD)", width: "min-w-[130px]", align: "text-right" },
  { id: "orders", label: "Orders", width: "w-20", align: "text-right" },
  { id: "team", label: "Team", width: "w-16", align: "text-right" },
  { id: "health", label: "Health", width: "w-20", align: "text-center" },
  { id: "revenue", label: "Revenue/mo", width: "min-w-[110px]", align: "text-right" },
  { id: "lastActive", label: "Last Active", width: "min-w-[100px]", align: "text-left" },
  { id: "tags", label: "Tags", width: "min-w-[150px]", align: "text-left" },
  { id: "created", label: "Created", width: "min-w-[100px]", align: "text-left" },
];

const ROW_HEIGHT = 36;

// ── Props ──────────────────────────────────────────────────────────────
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
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--card-bg)] border-b-2 border-[var(--card-border)] flex items-center min-w-max">
          {/* Checkbox */}
          <div className="w-10 shrink-0 px-2 py-2" />
          {/* Star */}
          <div className="w-8 shrink-0 px-1 py-2" />

          {SHEET_COLUMNS.map((col) => {
            const dir = getSortDir(col.id);
            return (
              <div
                key={col.id}
                onClick={(e) => col.id !== "row" && onToggleSort(col.id, e.shiftKey)}
                className={cn(
                  "shrink-0 px-2 py-2 text-[9px] font-bold text-foreground/40 uppercase tracking-wider select-none flex items-center gap-0.5 border-r border-[var(--card-border)]/50",
                  col.width,
                  col.align,
                  col.id !== "row" && "cursor-pointer hover:text-foreground/70",
                  col.sticky && "sticky left-[72px] z-20 bg-[var(--card-bg)]",
                )}
              >
                {col.label}
                {dir === "asc" && <ArrowUp className="w-2.5 h-2.5 text-foreground" />}
                {dir === "desc" && <ArrowDown className="w-2.5 h-2.5 text-foreground" />}
              </div>
            );
          })}
        </div>

        {/* Rows */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const m = merchants[virtualRow.index];
            if (!m) return null;
            const isSelected = selectedMerchants.has(m.id);
            const isStarred = starredSet.has(m.id);
            const healthScore = calculateHealthScore(m);

            return (
              <div
                key={m.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={cn(
                  "absolute left-0 w-full flex items-center min-w-max border-b border-[var(--card-border)]/50 transition-colors text-[11px]",
                  isSelected ? "bg-[var(--primary)]/[0.04]" : "hover:bg-foreground/[0.02]",
                  virtualRow.index % 2 === 1 && !isSelected && "bg-foreground/[0.01]",
                )}
                style={{
                  top: 0,
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  height: ROW_HEIGHT,
                }}
              >
                {/* Checkbox */}
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
                    className="w-3.5 h-3.5 rounded border-[var(--card-border)] accent-[var(--primary)]"
                  />
                </div>

                {/* Star */}
                <div className="w-8 shrink-0 px-1 flex items-center">
                  <button onClick={() => onToggleStar(m.id)} className="p-0.5">
                    <Star className={cn("w-3 h-3", isStarred ? "fill-amber-400 text-amber-400" : "text-foreground/15")} />
                  </button>
                </div>

                {/* Row number */}
                <div className="w-12 shrink-0 px-2 text-center text-foreground/30 tabular-nums">
                  {virtualRow.index + 1}
                </div>

                {/* Business (sticky) */}
                <div className="min-w-[200px] shrink-0 px-2 sticky left-[72px] z-10 bg-inherit flex items-center gap-1.5 border-r border-[var(--card-border)]/30">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[8px] shrink-0"
                    style={{ backgroundColor: m.branding?.primary_color || "#1E1E1E" }}
                  >
                    {m.business_name.charAt(0).toUpperCase()}
                  </div>
                  <button
                    onClick={() => onOpenDetail(m.id)}
                    className="font-semibold text-foreground truncate hover:underline text-left"
                  >
                    {m.business_name}
                  </button>
                </div>

                {/* Slug */}
                <div className="min-w-[120px] shrink-0 px-2 text-foreground/40 truncate border-r border-[var(--card-border)]/30">
                  {m.slug}
                </div>

                {/* Plan */}
                <div className="w-24 shrink-0 px-2 text-center border-r border-[var(--card-border)]/30">
                  <span className="text-[9px] font-bold uppercase">{m.plan}</span>
                </div>

                {/* Status */}
                <div className="w-24 shrink-0 px-2 text-center border-r border-[var(--card-border)]/30">
                  <span className="text-[9px] font-semibold capitalize">{m.status}</span>
                </div>

                {/* City */}
                <div className="min-w-[100px] shrink-0 px-2 text-foreground/60 flex items-center gap-1 border-r border-[var(--card-border)]/30">
                  {m.city ? <><MapPin className="w-2.5 h-2.5 shrink-0" />{m.city}</> : "\u2014"}
                </div>

                {/* Email */}
                <div className="min-w-[180px] shrink-0 px-2 text-foreground/50 truncate border-r border-[var(--card-border)]/30">
                  {m.contact_email || "\u2014"}
                </div>

                {/* Phone */}
                <div className="min-w-[120px] shrink-0 px-2 text-foreground/50 truncate border-r border-[var(--card-border)]/30">
                  {m.contact_phone || "\u2014"}
                </div>

                {/* Balance */}
                <div className="min-w-[120px] shrink-0 px-2 text-right font-medium tabular-nums border-r border-[var(--card-border)]/30">
                  {formatIQD(m.wallet?.balance_iqd ?? 0)}
                </div>

                {/* Charged */}
                <div className="min-w-[120px] shrink-0 px-2 text-right text-foreground/50 tabular-nums border-r border-[var(--card-border)]/30">
                  {formatIQD(m.wallet?.total_charged_iqd ?? 0)}
                </div>

                {/* Topped Up */}
                <div className="min-w-[130px] shrink-0 px-2 text-right text-foreground/50 tabular-nums border-r border-[var(--card-border)]/30">
                  {formatIQD(m.wallet?.total_topped_up_iqd ?? 0)}
                </div>

                {/* Orders */}
                <div className="w-20 shrink-0 px-2 text-right tabular-nums border-r border-[var(--card-border)]/30">
                  {m.usage?.orders_count ?? 0}
                </div>

                {/* Team */}
                <div className="w-16 shrink-0 px-2 text-right tabular-nums border-r border-[var(--card-border)]/30">
                  {m.usage?.team_members_count ?? 0}
                </div>

                {/* Health */}
                <div className="w-20 shrink-0 px-2 flex items-center justify-center gap-0.5 border-r border-[var(--card-border)]/30">
                  <Heart className="w-2.5 h-2.5 text-foreground/30" />
                  <span className="font-bold">{healthScore}</span>
                </div>

                {/* Revenue */}
                <div className="min-w-[110px] shrink-0 px-2 text-right tabular-nums text-foreground/60 border-r border-[var(--card-border)]/30">
                  {formatIQD(m.monthly_revenue ?? 0)}
                </div>

                {/* Last Active */}
                <div className="min-w-[100px] shrink-0 px-2 text-foreground/40 border-r border-[var(--card-border)]/30">
                  {m.last_active_at ? timeAgo(m.last_active_at) : "\u2014"}
                </div>

                {/* Tags */}
                <div className="min-w-[150px] shrink-0 px-2 flex items-center gap-1 border-r border-[var(--card-border)]/30">
                  {m.tags?.length > 0 ? (
                    m.tags.slice(0, 2).map((t) => (
                      <span key={t} className="px-1 py-0.5 rounded bg-foreground/[0.05] text-[8px] font-medium truncate max-w-[60px]">
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-foreground/15">\u2014</span>
                  )}
                  {m.tags?.length > 2 && <span className="text-[8px] text-foreground/30">+{m.tags.length - 2}</span>}
                </div>

                {/* Created */}
                <div className="min-w-[100px] shrink-0 px-2 text-foreground/40">
                  {new Date(m.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
