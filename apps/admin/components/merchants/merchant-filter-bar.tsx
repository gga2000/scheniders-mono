"use client";

import { ChevronDown, X, Filter } from "lucide-react";
import { useAdminStore } from "@/store/use-admin-store";

const PLAN_OPTIONS = [
  { value: "", label: "All Plans" },
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
];

const IRAQI_GOVERNORATES = [
  "Baghdad",
  "Basra",
  "Erbil",
  "Sulaymaniyah",
  "Najaf",
  "Karbala",
  "Duhok",
  "Kirkuk",
  "Mosul",
  "Diyala",
  "Wasit",
  "Maysan",
  "Muthanna",
  "Dhi Qar",
  "Anbar",
  "Babil",
  "Saladin",
  "Qadisiyyah",
];

const CITY_OPTIONS = [
  { value: "", label: "All Cities" },
  ...IRAQI_GOVERNORATES.map((city) => ({ value: city.toLowerCase(), label: city })),
];

function FilterPill({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  const isActive = !!value;

  return (
    <div className="relative inline-flex items-center">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`
          appearance-none pr-7 pl-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer
          ${
            isActive
              ? "border-[#1E1E1E] text-[#1E1E1E] bg-[var(--card-bg)] shadow-sm"
              : "border-[var(--card-border)] text-foreground/60 hover:border-foreground/30 bg-[var(--card-bg)]"
          }
        `}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-foreground/40" />
    </div>
  );
}

export function MerchantFilterBar() {
  const {
    planFilter,
    statusFilter,
    cityFilter,
    setPlanFilter,
    setStatusFilter,
    setCityFilter,
    clearFilters,
  } = useAdminStore();

  const activeFilterCount = [planFilter, statusFilter, cityFilter].filter(Boolean).length;

  return (
    <div className="sticky top-0 z-10 bg-[var(--background)]/80 backdrop-blur-sm py-3 -mx-1 px-1">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-foreground/40 shrink-0" />

        <FilterPill value={planFilter} options={PLAN_OPTIONS} onChange={setPlanFilter} />
        <FilterPill value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
        <FilterPill value={cityFilter} options={CITY_OPTIONS} onChange={setCityFilter} />

        {activeFilterCount > 0 && (
          <>
            <div className="w-5 h-5 rounded-full bg-[#1E1E1E] text-white text-[10px] flex items-center justify-center font-bold shrink-0">
              {activeFilterCount}
            </div>
            <button
              onClick={clearFilters}
              className="text-xs text-foreground/50 hover:text-foreground underline transition-colors"
            >
              Clear all
            </button>
          </>
        )}
      </div>
    </div>
  );
}
