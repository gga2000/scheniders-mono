"use client";

import { cn } from "@/lib/utils";
import { useLeadStore } from "@/store/use-lead-store";
import { useIndustries } from "@/hooks/use-industries";
import {
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
  type LeadStatus,
  type LeadPriority,
  type LeadTier,
  type LeadSourcePlatform,
} from "@/types/leads";
import { Search, X, Filter } from "lucide-react";

export function LeadFilterBar() {
  const {
    statusFilter, setStatusFilter,
    platformFilter, setPlatformFilter,
    priorityFilter, setPriorityFilter,
    tierFilter, setTierFilter,
    industryFilter, setIndustryFilter,
    searchQuery, setSearchQuery,
    clearFilters,
    activeFilterCount,
  } = useLeadStore();

  const { data: industries } = useIndustries();
  const filterCount = activeFilterCount();

  return (
    <div className="space-y-3">
      {/* Search + Clear */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search merchants..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {filterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Clear {filterCount} filter{filterCount > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Status Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[var(--muted)] font-medium uppercase tracking-wider mr-1">Status</span>
        {(Object.entries(LEAD_STATUS_CONFIG) as [LeadStatus, typeof LEAD_STATUS_CONFIG.new][]).map(
          ([key, config]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? null : key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                statusFilter === key
                  ? "ring-2 ring-offset-1 ring-offset-[var(--background)]"
                  : "opacity-60 hover:opacity-100"
              )}
              style={{
                backgroundColor: config.bgColor,
                color: config.color,
                ...(statusFilter === key ? { ringColor: config.color } : {}),
              }}
            >
              {config.label}
            </button>
          )
        )}
      </div>

      {/* Dropdowns Row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Platform */}
        <select
          value={platformFilter ?? ""}
          onChange={(e) => setPlatformFilter((e.target.value || null) as LeadSourcePlatform | null)}
          className="px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)]"
        >
          <option value="">All Platforms</option>
          {(Object.entries(PLATFORM_CONFIG) as [LeadSourcePlatform, typeof PLATFORM_CONFIG.instagram][]).map(
            ([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            )
          )}
        </select>

        {/* Priority */}
        <select
          value={priorityFilter ?? ""}
          onChange={(e) => setPriorityFilter((e.target.value || null) as LeadPriority | null)}
          className="px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)]"
        >
          <option value="">All Priorities</option>
          {(Object.entries(LEAD_PRIORITY_CONFIG) as [LeadPriority, typeof LEAD_PRIORITY_CONFIG.low][]).map(
            ([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            )
          )}
        </select>

        {/* Tier */}
        <select
          value={tierFilter ?? ""}
          onChange={(e) => setTierFilter((e.target.value || null) as LeadTier | null)}
          className="px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)]"
        >
          <option value="">All Tiers</option>
          {(Object.entries(LEAD_TIER_CONFIG) as [LeadTier, typeof LEAD_TIER_CONFIG.bronze][]).map(
            ([key, config]) => (
              <option key={key} value={key}>{config.label} ({config.minFollowers.toLocaleString()}+)</option>
            )
          )}
        </select>

        {/* Industry */}
        <select
          value={industryFilter ?? ""}
          onChange={(e) => setIndustryFilter(e.target.value || null)}
          className="px-3 py-1.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-xs text-[var(--foreground)]"
        >
          <option value="">All Industries</option>
          {(industries ?? []).filter((i) => i.is_active).map((industry) => (
            <option key={industry.id} value={industry.id}>{industry.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
