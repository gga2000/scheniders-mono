"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useLeadStore, useActiveFilterCount } from "@/store/use-lead-store";
import { useIndustries } from "@/hooks/use-industries";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_PRIORITY_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
  type LeadStatus,
  type LeadPriority,
  type LeadTier,
  type LeadSourcePlatform,
} from "@/types/leads";
import { Search, X, Filter, ChevronDown, ArrowUpDown } from "lucide-react";

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Newest" },
  { value: "lead_score:desc", label: "Highest score" },
  { value: "follower_count:desc", label: "Most followers" },
  { value: "estimated_daily_orders:desc", label: "Most est. orders" },
  { value: "merchant_name:asc", label: "Name (A–Z)" },
];

const SELECT =
  "appearance-none pl-3 pr-8 py-1.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-xs text-[var(--foreground)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-shadow";
// Applied (non-default) filter — make it visibly active.
const SELECT_ACTIVE = "border-[#A78BFA] bg-[#A78BFA]/10 text-[var(--foreground)] font-semibold";

export function LeadFilterBar({ actions }: { actions?: ReactNode }) {
  const {
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
    priorityFilter,
    setPriorityFilter,
    tierFilter,
    setTierFilter,
    industryFilter,
    setIndustryFilter,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    clearFilters,
  } = useLeadStore();

  const { data: industries } = useIndustries();
  const filterCount = useActiveFilterCount();

  return (
    <div className="space-y-3">
      {/* Search + dropdowns */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search merchants…"
            className="w-full pl-10 pr-9 py-2 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 transition-shadow"
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

        <div className="flex items-center gap-2 flex-wrap lg:ml-auto">
          {/* Sort */}
          <div className="relative">
            <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)] pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={cn(SELECT, "pl-8")}
              title="Sort leads"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)] pointer-events-none" />
          </div>

          <span className="hidden lg:block w-px h-5 bg-[var(--card-border)]" />

          {/* Platform */}
          <div className="relative">
            <select
              value={platformFilter ?? ""}
              onChange={(e) =>
                setPlatformFilter((e.target.value || null) as LeadSourcePlatform | null)
              }
              className={cn(SELECT, platformFilter && SELECT_ACTIVE)}
            >
              <option value="">All Platforms</option>
              {(Object.entries(PLATFORM_CONFIG) as [LeadSourcePlatform, (typeof PLATFORM_CONFIG)["instagram"]][]).map(
                ([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ),
              )}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)] pointer-events-none" />
          </div>

          {/* Priority */}
          <div className="relative">
            <select
              value={priorityFilter ?? ""}
              onChange={(e) => setPriorityFilter((e.target.value || null) as LeadPriority | null)}
              className={cn(SELECT, priorityFilter && SELECT_ACTIVE)}
            >
              <option value="">All Priorities</option>
              {(Object.entries(LEAD_PRIORITY_CONFIG) as [LeadPriority, (typeof LEAD_PRIORITY_CONFIG)["low"]][]).map(
                ([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ),
              )}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)] pointer-events-none" />
          </div>

          {/* Tier */}
          <div className="relative">
            <select
              value={tierFilter ?? ""}
              onChange={(e) => setTierFilter((e.target.value || null) as LeadTier | null)}
              className={cn(SELECT, tierFilter && SELECT_ACTIVE)}
            >
              <option value="">All Tiers</option>
              {(Object.entries(LEAD_TIER_CONFIG) as [LeadTier, (typeof LEAD_TIER_CONFIG)["bronze"]][]).map(
                ([key, config]) => (
                  <option key={key} value={key}>
                    {config.label} ({config.minFollowers.toLocaleString()}+)
                  </option>
                ),
              )}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)] pointer-events-none" />
          </div>

          {/* Industry */}
          <div className="relative">
            <select
              value={industryFilter ?? ""}
              onChange={(e) => setIndustryFilter(e.target.value || null)}
              className={cn(SELECT, industryFilter && SELECT_ACTIVE)}
            >
              <option value="">All Industries</option>
              {(industries ?? [])
                .filter((i) => i.is_active)
                .map((industry) => (
                  <option key={industry.id} value={industry.id}>
                    {industry.name}
                  </option>
                ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)] pointer-events-none" />
          </div>

          {filterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Filter className="w-3.5 h-3.5" />
              Clear {filterCount}
            </button>
          )}
        </div>
      </div>

      {/* Status Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-[var(--muted)] font-semibold uppercase tracking-wider mr-1">
          Status
        </span>
        {(Object.entries(LEAD_STATUS_CONFIG) as [LeadStatus, (typeof LEAD_STATUS_CONFIG)["new"]][]).map(
          ([key, config]) => {
            const active = statusFilter === key;
            const ui = LEAD_STATUS_UI[key];
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(active ? null : key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                  active ? "shadow-sm scale-[1.02]" : "border-transparent hover:brightness-95",
                )}
                style={
                  active
                    ? { backgroundColor: `${ui.solid}26`, borderColor: ui.solid, color: ui.solid }
                    : { backgroundColor: ui.soft, color: ui.solid }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ui.solid }} />
                {config.label}
              </button>
            );
          },
        )}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
    </div>
  );
}
