"use client";

import { useState } from "react";
import { Plus, X, Bookmark } from "lucide-react";
import { useAdminStore } from "@/store/use-admin-store";
import { cn } from "@/lib/utils";

export interface FilterPreset {
  id: string;
  name: string;
  filters: {
    planFilter: string | null;
    statusFilter: string | null;
    cityFilter: string | null;
    balanceFilter: string | null;
    healthFilter: string | null;
  };
}

const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: "at-risk",
    name: "At-Risk Merchants",
    filters: { planFilter: null, statusFilter: "active", cityFilter: null, balanceFilter: "critical", healthFilter: null },
  },
  {
    id: "new-trials",
    name: "New Trials",
    filters: { planFilter: null, statusFilter: "trial", cityFilter: null, balanceFilter: null, healthFilter: null },
  },
  {
    id: "enterprise",
    name: "Enterprise Accounts",
    filters: { planFilter: "enterprise", statusFilter: null, cityFilter: null, balanceFilter: null, healthFilter: null },
  },
];

export function FilterPresets() {
  const {
    filterPresets,
    addFilterPreset,
    removeFilterPreset,
    setPlanFilter,
    setStatusFilter,
    setCityFilter,
    setBalanceFilter,
    setHealthFilter,
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
  } = useAdminStore();

  const [showSave, setShowSave] = useState(false);
  const [presetName, setPresetName] = useState("");

  const allPresets = [...DEFAULT_PRESETS, ...filterPresets];

  function applyPreset(preset: FilterPreset) {
    setPlanFilter(preset.filters.planFilter);
    setStatusFilter(preset.filters.statusFilter);
    setCityFilter(preset.filters.cityFilter);
    setBalanceFilter(preset.filters.balanceFilter);
    setHealthFilter(preset.filters.healthFilter);
  }

  function isPresetActive(preset: FilterPreset): boolean {
    return (
      preset.filters.planFilter === planFilter &&
      preset.filters.statusFilter === statusFilter &&
      preset.filters.cityFilter === cityFilter &&
      preset.filters.balanceFilter === balanceFilter &&
      preset.filters.healthFilter === healthFilter
    );
  }

  function handleSave() {
    if (!presetName.trim()) return;
    addFilterPreset({
      id: `custom-${Date.now()}`,
      name: presetName.trim(),
      filters: { planFilter, statusFilter, cityFilter, balanceFilter, healthFilter },
    });
    setPresetName("");
    setShowSave(false);
  }

  const hasActiveFilters = !!(planFilter || statusFilter || cityFilter || balanceFilter || healthFilter);

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      <Bookmark className="w-3.5 h-3.5 text-foreground/30 shrink-0" />
      <span className="text-[10px] text-foreground/40 font-medium shrink-0">Presets:</span>

      {allPresets.map((preset) => {
        const isDefault = DEFAULT_PRESETS.some((d) => d.id === preset.id);
        const active = isPresetActive(preset);

        return (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset)}
            className={cn(
              "group relative rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-all shrink-0 flex items-center gap-1.5",
              active
                ? "bg-[#1E1E1E] text-white border-[#1E1E1E] dark:bg-white dark:text-[#1E1E1E] dark:border-white"
                : "bg-[var(--card-bg)] text-foreground/60 border-[var(--card-border)] hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {preset.name}
            {!isDefault && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  removeFilterPreset(preset.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        );
      })}

      {/* Save current filters as preset */}
      {hasActiveFilters && !showSave && (
        <button
          onClick={() => setShowSave(true)}
          className="rounded-lg px-2 py-1 text-[11px] font-medium border border-dashed border-[var(--card-border)] text-foreground/40 hover:text-foreground hover:border-foreground/30 transition-all shrink-0 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Save
        </button>
      )}

      {showSave && (
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Preset name..."
            className="h-6 px-2 text-[11px] rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-foreground/30 w-28"
            autoFocus
          />
          <button onClick={handleSave} className="text-[11px] font-semibold text-green-600 hover:text-green-700">
            Save
          </button>
          <button onClick={() => setShowSave(false)} className="text-[11px] text-foreground/40 hover:text-foreground">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
