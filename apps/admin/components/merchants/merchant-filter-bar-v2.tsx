"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { Filter, X, CalendarDays } from "lucide-react";
import { useAdminStore } from "@/store/use-admin-store";
import { cn } from "@/lib/utils";

const DateRangePicker = dynamic(
  () => import("@scheniders/ui/date-range-picker").then((m) => m.DateRangePicker),
  { ssr: false }
);

const STATUS_PILLS = [
  { value: "", label: "All", dot: "bg-foreground/30" },
  { value: "trial", label: "Trial", dot: "bg-amber-500" },
  { value: "active", label: "Active", dot: "bg-green-500" },
  { value: "suspended", label: "Suspended", dot: "bg-red-500" },
  { value: "cancelled", label: "Cancelled", dot: "bg-gray-400" },
];

const PLAN_PILLS = [
  { value: "", label: "All Plans" },
  { value: "starter", label: "Starter", color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-400/15 dark:text-blue-300 dark:border-blue-400/30" },
  { value: "growth", label: "Growth", color: "bg-green-100 text-green-700 border-green-200 dark:bg-green-400/15 dark:text-green-300 dark:border-green-400/30" },
  { value: "professional", label: "Pro", color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-400/15 dark:text-purple-300 dark:border-purple-400/30" },
  { value: "enterprise", label: "Enterprise", color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/30" },
];

const CITY_PILLS = [
  "Baghdad", "Basra", "Erbil", "Sulaymaniyah", "Najaf", "Karbala",
  "Duhok", "Kirkuk", "Mosul", "Diyala", "Wasit", "Maysan",
  "Muthanna", "Dhi Qar", "Anbar", "Babil", "Saladin", "Qadisiyyah",
];

const BALANCE_PILLS = [
  { value: "", label: "All Balances" },
  { value: "critical", label: "Critical (<10K)", color: "text-red-600" },
  { value: "low", label: "Low (10K-50K)", color: "text-amber-600" },
  { value: "healthy", label: "Healthy (>50K)", color: "text-green-600" },
];

const HEALTH_PILLS = [
  { value: "", label: "All Health" },
  { value: "at-risk", label: "At Risk", color: "text-red-600" },
  { value: "warning", label: "Warning", color: "text-amber-600" },
  { value: "healthy", label: "Healthy", color: "text-green-600" },
];

function Pill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold border snap-start shrink-0",
        active
          ? "bg-[#1E1E1E] text-white border-[#1E1E1E] shadow-[0_0_15px_rgba(30,30,30,0.15)] dark:bg-white dark:text-[#1E1E1E] dark:border-white dark:shadow-[0_0_15px_rgba(255,255,255,0.1)] scale-[1.03]"
          : "bg-[var(--card-bg)] text-foreground/60 border-[var(--card-border)] hover:border-foreground/30 hover:text-foreground active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

export const MerchantFilterBarV2 = memo(function MerchantFilterBarV2() {
  const {
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
    dateRange,
    setPlanFilter,
    setStatusFilter,
    setCityFilter,
    setBalanceFilter,
    setHealthFilter,
    setDateRange,
    clearFilters,
  } = useAdminStore();

  const hasDateFilter = !!(dateRange.from || dateRange.to);
  const activeFilterCount = [planFilter, statusFilter, cityFilter, balanceFilter, healthFilter, hasDateFilter ? "date" : null].filter(Boolean).length;

  return (
    <div className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-xl py-3 -mx-1 px-1">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide snap-x pb-1">
        <Filter className="h-4 w-4 text-foreground/40 shrink-0" />

        {/* Status Pills */}
        {STATUS_PILLS.map((pill) => (
          <Pill
            key={`s-${pill.value}`}
            active={statusFilter === pill.value || (!statusFilter && !pill.value)}
            onClick={() => setStatusFilter(pill.value || null)}
          >
            {pill.dot && <span className={cn("w-1.5 h-1.5 rounded-full", pill.dot)} />}
            {pill.label}
          </Pill>
        ))}

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--card-border)] shrink-0 mx-1" />

        {/* Plan Pills */}
        {PLAN_PILLS.map((pill) => (
          <Pill
            key={`p-${pill.value}`}
            active={planFilter === pill.value || (!planFilter && !pill.value)}
            onClick={() => setPlanFilter(pill.value || null)}
            className={planFilter === pill.value && pill.color ? pill.color + " border-current" : undefined}
          >
            {pill.label}
          </Pill>
        ))}

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--card-border)] shrink-0 mx-1" />

        {/* Balance Range Pills */}
        {BALANCE_PILLS.map((pill) => (
          <Pill
            key={`b-${pill.value}`}
            active={balanceFilter === pill.value || (!balanceFilter && !pill.value)}
            onClick={() => setBalanceFilter(pill.value || null)}
          >
            {pill.color && balanceFilter === pill.value && (
              <span className={cn("w-1.5 h-1.5 rounded-full bg-current", pill.color)} />
            )}
            {pill.label}
          </Pill>
        ))}

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--card-border)] shrink-0 mx-1" />

        {/* Health Score Pills */}
        {HEALTH_PILLS.map((pill) => (
          <Pill
            key={`h-${pill.value}`}
            active={healthFilter === pill.value || (!healthFilter && !pill.value)}
            onClick={() => setHealthFilter(pill.value || null)}
          >
            {pill.color && healthFilter === pill.value && (
              <span className={cn("w-1.5 h-1.5 rounded-full bg-current", pill.color)} />
            )}
            {pill.label}
          </Pill>
        ))}

        {/* Date Range */}
        <div className="w-px h-6 bg-[var(--card-border)] shrink-0 mx-1" />
        <div className="shrink-0">
          <DateRangePicker
            dateFrom={dateRange.from ?? undefined}
            dateTo={dateRange.to ?? undefined}
            onDateChange={(from, to) => setDateRange({ from: from ?? null, to: to ?? null })}
          />
        </div>

        {/* City pills (scrollable) */}
        {cityFilter && (
          <>
            <div className="w-px h-6 bg-[var(--card-border)] shrink-0 mx-1" />
            <Pill active onClick={() => setCityFilter(null)}>
              {cityFilter}
              <X className="w-3 h-3 ml-0.5" />
            </Pill>
          </>
        )}

        {/* Active filter count + clear */}
        {activeFilterCount > 0 && (
          <>
            <div className="w-px h-6 bg-[var(--card-border)] shrink-0 mx-1" />
            <span className="w-5 h-5 rounded-full bg-[#1E1E1E] dark:bg-white text-white dark:text-[#1E1E1E] text-[10px] flex items-center justify-center font-bold shrink-0">
              {activeFilterCount}
            </span>
            <button
              onClick={clearFilters}
              className="text-xs text-foreground/50 hover:text-foreground underline transition-colors shrink-0"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* City chips row — only show if no city is selected */}
      {!cityFilter && (
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
          <span className="text-[10px] text-foreground/40 font-medium shrink-0 mr-1">City:</span>
          {CITY_PILLS.map((city) => (
            <button
              key={city}
              onClick={() => setCityFilter(city.toLowerCase())}
              className="rounded-full px-2.5 py-1 text-[10px] font-medium border border-[var(--card-border)] text-foreground/50 hover:text-foreground hover:border-foreground/30 transition-all shrink-0 bg-[var(--card-bg)]"
            >
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
