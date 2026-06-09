"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useInfiniteLeads } from "@/hooks/use-infinite-leads";
import { useLeadAnalytics } from "@/hooks/use-lead-analytics";
import { useCreateLead } from "@/hooks/use-lead-mutations";
import { useLeadStore } from "@/store/use-lead-store";
import { usePageHeader } from "@/store/use-page-header";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_UI } from "@/types/leads";
import type { Lead, LeadFormData, LeadStatus } from "@/types/leads";
import { LeadMobileRow } from "./lead-mobile-row";
import { LeadRegisterSheet } from "./lead-register-sheet";
import { AdvanceStageSheet } from "./advance-stage-sheet";
import {
  Search,
  X,
  Plus,
  UserPlus,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export function LeadsMobileView() {
  const [registerOpen, setRegisterOpen] = useState(false);
  const [stageLead, setStageLead] = useState<Lead | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteLeads();

  const leads = data?.pages.flatMap((p) => p.leads) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // Publish the page header (title + live count) to the global topbar.
  const setPageHeader = usePageHeader((s) => s.setHeader);
  const clearPageHeader = usePageHeader((s) => s.clearHeader);
  useEffect(() => {
    setPageHeader({
      title: "Prospects",
      subtitle: `${total.toLocaleString()} ${total === 1 ? "prospect" : "prospects"} in pipeline`,
    });
    return () => clearPageHeader();
  }, [total, setPageHeader, clearPageHeader]);

  const { searchQuery, setSearchQuery, statusFilter, setStatusFilter } =
    useLeadStore();

  const { data: analytics } = useLeadAnalytics();
  const byStatus = analytics?.by_status;

  const createLead = useCreateLead();
  const handleCreate = (formData: LeadFormData): Promise<boolean> =>
    new Promise((resolve) => {
      createLead.mutate(formData, {
        onSuccess: () => resolve(true),
        onError: () => resolve(false),
      });
    });

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Title + count live in the global topbar (see usePageHeader) */}

      {/* Sticky search */}
      <div className="sticky top-0 z-20 -mx-4 bg-[var(--background)]/85 px-4 py-2 backdrop-blur">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search merchants…"
            className="w-full h-11 pl-10 pr-9 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]/40 transition-shadow"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stage chips */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {/* All chip */}
        <button
          type="button"
          onClick={() => setStatusFilter(null)}
          className={cn(
            "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold border transition-colors shrink-0",
            statusFilter === null
              ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
              : "border-transparent bg-[var(--card-bg)] text-[var(--muted)]",
          )}
        >
          All {total > 0 ? total : ""}
        </button>

        {(Object.entries(LEAD_STATUS_CONFIG) as [LeadStatus, (typeof LEAD_STATUS_CONFIG)[LeadStatus]][]).map(
          ([key]) => {
            const ui = LEAD_STATUS_UI[key];
            const cfg = LEAD_STATUS_CONFIG[key];
            const count = byStatus?.[key];
            const isActive = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(statusFilter === key ? null : key)}
                className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold border transition-colors shrink-0"
                style={
                  isActive
                    ? {
                        backgroundColor: `${ui.solid}26`,
                        borderColor: ui.solid,
                        color: ui.solid,
                      }
                    : {
                        backgroundColor: ui.soft,
                        borderColor: "transparent",
                        color: ui.solid,
                      }
                }
              >
                {cfg.label}
                {count != null ? ` ${count}` : ""}
              </button>
            );
          },
        )}
      </div>

      {/* List area */}
      {isError ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Failed to load leads
          </p>
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="rounded-xl border border-[var(--card-border)] px-5 py-2 text-sm font-semibold hover:bg-[var(--card-bg)] transition-colors"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-2xl bg-[var(--card-border)]/40 animate-pulse"
            />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF8899]/15 to-[#A78BFA]/15">
            <UserPlus className="h-7 w-7 text-[#FF8899]" />
          </div>
          <p className="text-sm font-bold text-[var(--foreground)]">
            No prospects yet
          </p>
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF8899] to-[#A78BFA] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:brightness-105"
          >
            <UserPlus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {leads.map((l) => (
            <LeadMobileRow key={l.id} lead={l} onStatusTap={setStageLead} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNextPage && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full rounded-xl border border-[var(--card-border)] py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isFetchingNextPage ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </>
          ) : (
            "Load more"
          )}
        </button>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setRegisterOpen(true)}
        className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF8899] to-[#A78BFA] text-white shadow-lg active:scale-95 transition-transform"
        aria-label="Add lead"
      >
        <Plus className="h-7 w-7" />
      </button>

      {/* Sheets */}
      <LeadRegisterSheet
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSubmit={handleCreate}
      />
      <AdvanceStageSheet lead={stageLead} onClose={() => setStageLead(null)} />
    </div>
  );
}
