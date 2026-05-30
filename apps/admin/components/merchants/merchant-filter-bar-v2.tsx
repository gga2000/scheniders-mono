"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { X, MapPin, ChevronDown, Search, CreditCard, Wallet, Activity, AlertCircle } from "lucide-react";
import { useAdminStore } from "@/store/use-admin-store";
import { useMerchantsStats } from "@/hooks/use-merchants-stats";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import type { AdminTenant } from "@/types/admin";

const DateRangePicker = dynamic(
  () => import("@scheniders/ui/date-range-picker").then((m) => m.DateRangePicker),
  { ssr: false }
);

// ── Status pills (primary filter, colored like orders) ─────────────
const STATUS_PILLS: Array<{
  value: string;
  label: string;
  // Active background + text colors (like orders' getStatusBadgeStyle)
  activeColor: string;
  // Inactive tint
  inactiveColor: string;
}> = [
  {
    value: "",
    label: "All",
    activeColor: "bg-[#1E1E1E] text-white border-[#1E1E1E] dark:bg-white dark:text-[#1E1E1E] dark:border-white",
    inactiveColor: "bg-[var(--card-bg)] text-foreground/70 border-[var(--card-border)] hover:bg-foreground/[0.04]",
  },
  {
    value: "trial",
    label: "Trial",
    activeColor: "bg-amber-200 text-amber-900 border-amber-300 ring-2 ring-amber-400/40 dark:bg-amber-400/25 dark:text-amber-200 dark:border-amber-400/40",
    inactiveColor: "bg-amber-50 text-amber-800 border-amber-100 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300/80 dark:border-amber-400/20 dark:hover:bg-amber-400/15",
  },
  {
    value: "active",
    label: "Active",
    activeColor: "bg-emerald-200 text-emerald-900 border-emerald-300 ring-2 ring-emerald-400/40 dark:bg-emerald-400/25 dark:text-emerald-200 dark:border-emerald-400/40",
    inactiveColor: "bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300/80 dark:border-emerald-400/20 dark:hover:bg-emerald-400/15",
  },
  {
    value: "suspended",
    label: "Suspended",
    activeColor: "bg-rose-200 text-rose-900 border-rose-300 ring-2 ring-rose-400/40 dark:bg-rose-400/25 dark:text-rose-200 dark:border-rose-400/40",
    inactiveColor: "bg-rose-50 text-rose-800 border-rose-100 hover:bg-rose-100 dark:bg-rose-400/10 dark:text-rose-300/80 dark:border-rose-400/20 dark:hover:bg-rose-400/15",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    activeColor: "bg-slate-300 text-slate-900 border-slate-400 ring-2 ring-slate-400/40 dark:bg-slate-400/25 dark:text-slate-200 dark:border-slate-400/40",
    inactiveColor: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-400/10 dark:text-slate-300/80 dark:border-slate-400/20 dark:hover:bg-slate-400/15",
  },
];

const PLAN_OPTIONS = [
  { value: "", label: "All Plans" },
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "professional", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

const BALANCE_OPTIONS = [
  { value: "", label: "All Balances" },
  { value: "critical", label: "Critical (<10K)", dot: "bg-red-500" },
  { value: "low", label: "Low (10K–50K)", dot: "bg-amber-500" },
  { value: "healthy", label: "Healthy (>50K)", dot: "bg-green-500" },
];

const HEALTH_OPTIONS = [
  { value: "", label: "All Health" },
  { value: "at-risk", label: "At Risk", dot: "bg-red-500" },
  { value: "warning", label: "Warning", dot: "bg-amber-500" },
  { value: "healthy", label: "Healthy", dot: "bg-green-500" },
];

const CITY_PILLS = [
  "Baghdad", "Basra", "Erbil", "Sulaymaniyah", "Najaf", "Karbala",
  "Duhok", "Kirkuk", "Mosul", "Diyala", "Wasit", "Maysan",
  "Muthanna", "Dhi Qar", "Anbar", "Babil", "Saladin", "Qadisiyyah",
];

// ── Generic dropdown filter button ─────────────────────────────────
function FilterDropdown({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string; dot?: string }>;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === (value ?? ""));
  const isActive = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border",
            isActive
              ? "bg-[#1E1E1E] text-white border-[#1E1E1E] dark:bg-white dark:text-[#1E1E1E] dark:border-white shadow-sm"
              : "bg-[var(--card-bg)] text-foreground/70 border-[var(--card-border)] hover:text-foreground hover:border-foreground/30"
          )}
        >
          {Icon && <Icon className="w-3 h-3" />}
          <span className="text-foreground/40 font-normal">{label}:</span>
          <span>{selected?.label ?? options[0]?.label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-52 p-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl"
      >
        {options.map((opt) => {
          const isSelected = (value ?? "") === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value || null);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md transition-colors text-left",
                isSelected
                  ? "bg-foreground/[0.06] text-foreground font-semibold"
                  : "text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground"
              )}
            >
              {opt.dot && (
                <span className={cn("w-1.5 h-1.5 rounded-full", opt.dot)} />
              )}
              <span className="flex-1">{opt.label}</span>
              {isSelected && (
                <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ── City picker popover ────────────────────────────────────────────
function CityPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = CITY_PILLS.filter((c) =>
    c.toLowerCase().includes(query.toLowerCase())
  );
  const isActive = !!value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border",
            isActive
              ? "bg-[#1E1E1E] text-white border-[#1E1E1E] dark:bg-white dark:text-[#1E1E1E] dark:border-white shadow-sm"
              : "bg-[var(--card-bg)] text-foreground/70 border-[var(--card-border)] hover:text-foreground hover:border-foreground/30"
          )}
        >
          <MapPin className="w-3 h-3" />
          <span className={cn(isActive ? "" : "text-foreground/40 font-normal")}>
            {isActive ? "" : "City:"}
          </span>
          <span className="capitalize">{value ?? "Any"}</span>
          {isActive ? (
            <X
              className="w-3 h-3 opacity-70 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          ) : (
            <ChevronDown className="w-3 h-3 opacity-60" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl"
      >
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cities..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-[var(--background)] border border-[var(--card-border)] outline-none focus:border-foreground/30"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto grid grid-cols-2 gap-1">
          {filtered.length === 0 ? (
            <div className="col-span-2 text-center py-4 text-xs text-foreground/40">
              No cities found
            </div>
          ) : (
            filtered.map((city) => (
              <button
                key={city}
                onClick={() => {
                  onChange(city.toLowerCase());
                  setOpen(false);
                  setQuery("");
                }}
                className="text-left px-2.5 py-1.5 text-xs rounded-md hover:bg-foreground/[0.05] transition-colors text-foreground/80 hover:text-foreground"
              >
                {city}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface MerchantFilterBarV2Props {
  /** Kept for prop compatibility; counts now come from /api/merchants/stats. */
  merchants?: AdminTenant[];
  /** Slot rendered to the right of the search input (tool icons). */
  searchAccessory?: React.ReactNode;
  /** Slot rendered to the right of the status pills row (e.g. view-mode toggle). */
  pillsAccessory?: React.ReactNode;
}

export const MerchantFilterBarV2 = memo(function MerchantFilterBarV2({
  searchAccessory,
  pillsAccessory,
}: MerchantFilterBarV2Props) {
  const {
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
    dateRange,
    searchQuery,
    setSearchQuery,
    setPlanFilter,
    setStatusFilter,
    setCityFilter,
    setBalanceFilter,
    setHealthFilter,
    setDateRange,
    clearFilters,
  } = useAdminStore();

  const hasDateFilter = !!(dateRange.from || dateRange.to);
  const activeFilterCount = [
    planFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
    hasDateFilter ? "date" : null,
  ].filter(Boolean).length;

  // ── Status counts (server-aggregated; ignore current status filter
  // so all pills show their counts regardless of which one is active). ──
  const { data: stats } = useMerchantsStats({ ignoreStatusFilter: true });
  const statusCounts: Record<string, number> = {
    "": stats?.total ?? 0,
    trial: stats?.status.trial ?? 0,
    active: stats?.status.active ?? 0,
    suspended: stats?.status.suspended ?? 0,
    cancelled: stats?.status.cancelled ?? 0,
    attention: stats?.buckets.attention ?? 0,
  };

  const attentionActive = statusFilter === "attention";
  const attentionCount = statusCounts.attention;

  return (
    <div className="space-y-3">
      {/* Search Row — search input + tool accessories on the right */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, slug, or ID..."
            className="w-full pl-11 pr-10 py-3 text-sm rounded-2xl bg-[var(--background)] border border-[var(--card-border)] outline-none focus:border-foreground/30 focus:ring-2 focus:ring-foreground/5 transition-all placeholder:text-foreground/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-foreground/[0.05] text-foreground/50 hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {searchAccessory && (
          <div className="flex items-center gap-0.5 shrink-0 pl-1">
            {searchAccessory}
          </div>
        )}
      </div>

      {/* Status Pills + View Modes — primary filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {STATUS_PILLS.map((pill) => {
            const active = (statusFilter ?? "") === pill.value;
            const count = statusCounts[pill.value] ?? 0;
            return (
              <button
                key={pill.value}
                onClick={() => setStatusFilter(pill.value || null)}
                className={cn(
                  "rounded-full whitespace-nowrap transition-all flex items-center gap-2 px-4 py-1.5 text-sm font-semibold border",
                  active
                    ? `${pill.activeColor} scale-[1.03] shadow-sm`
                    : pill.inactiveColor
                )}
              >
                <span>{pill.label}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-[11px] font-black min-w-[22px] text-center",
                    active ? "bg-black/10 dark:bg-white/15" : "bg-current/15"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Visual divider before smart filters */}
          {attentionCount > 0 && (
            <span aria-hidden className="w-px h-6 bg-foreground/10 mx-1" />
          )}

          {/* Needs Attention — smart filter (distinct from status filters) */}
          {attentionCount > 0 && (
            <button
              onClick={() =>
                setStatusFilter(attentionActive ? null : "attention")
              }
              className={cn(
                "rounded-full whitespace-nowrap transition-all flex items-center gap-2 px-4 py-1.5 text-sm font-bold border relative",
                attentionActive
                  ? "bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-400 scale-[1.03] shadow-md shadow-rose-500/40"
                  : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-400/10 dark:text-rose-300 dark:border-rose-400/30 dark:hover:bg-rose-400/20"
              )}
              title="Trials expiring, suspended, cancelled, or critical balance"
            >
              <span className="relative inline-flex w-2 h-2">
                <span
                  className={cn(
                    "absolute inset-0 rounded-full animate-ping",
                    attentionActive ? "bg-white/70" : "bg-rose-500/70"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex w-2 h-2 rounded-full",
                    attentionActive ? "bg-white" : "bg-rose-500"
                  )}
                />
              </span>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Needs Attention</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[11px] font-black min-w-[22px] text-center",
                  attentionActive
                    ? "bg-white/20 text-white"
                    : "bg-rose-500 text-white"
                )}
              >
                {attentionCount}
              </span>
            </button>
          )}
        </div>
        {pillsAccessory && (
          <div className="shrink-0">
            {pillsAccessory}
          </div>
        )}
      </div>

      {/* Secondary filters — compact dropdowns */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-foreground/5">
        <span className="text-[10px] uppercase tracking-widest text-foreground/40 font-bold mr-1">
          Refine
        </span>
        <FilterDropdown
          icon={CreditCard}
          label="Plan"
          value={planFilter}
          options={PLAN_OPTIONS}
          onChange={setPlanFilter}
        />
        <FilterDropdown
          icon={Wallet}
          label="Balance"
          value={balanceFilter}
          options={BALANCE_OPTIONS}
          onChange={setBalanceFilter}
        />
        <FilterDropdown
          icon={Activity}
          label="Health"
          value={healthFilter}
          options={HEALTH_OPTIONS}
          onChange={setHealthFilter}
        />
        <CityPicker value={cityFilter} onChange={setCityFilter} />
        <DateRangePicker
          dateFrom={dateRange.from ?? undefined}
          dateTo={dateRange.to ?? undefined}
          onDateChange={(from, to) => setDateRange({ from: from ?? null, to: to ?? null })}
        />
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="ml-auto text-xs text-foreground/60 hover:text-foreground underline-offset-2 hover:underline transition-colors flex items-center gap-1.5"
          >
            <span className="w-4 h-4 rounded-full bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] text-[10px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
});
