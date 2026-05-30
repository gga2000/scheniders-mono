"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLeads } from "@/hooks/use-leads";
import { useCreateLead, useUpdateLead, useDeleteLead, useBulkLeadAction } from "@/hooks/use-lead-mutations";
import { useLeadStore } from "@/store/use-lead-store";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import { LeadForm } from "@/components/leads/lead-form";
import { LeadCard } from "@/components/leads/lead-card";
import { LeadKanban } from "@/components/leads/lead-kanban";
import { LeadImportDialog } from "@/components/leads/lead-import-dialog";
import {
  LEAD_STATUS_CONFIG,
  LEAD_PRIORITY_CONFIG,
  PLATFORM_CONFIG,
  LEAD_TIER_CONFIG,
} from "@/types/leads";
import type { LeadFormData, LeadStatus } from "@/types/leads";
import {
  UserPlus,
  Upload,
  LayoutGrid,
  Kanban,
  Table2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function LeadsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { viewMode, setViewMode, selectedLeads, toggleLead, selectAll, clearSelection } = useLeadStore();
  const { data, isLoading, isError } = useLeads(page, viewMode === "kanban" ? 100 : 20);
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const bulkAction = useBulkLeadAction();

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const handleCreateLead = (formData: LeadFormData) => {
    createLead.mutate(formData, {
      onSuccess: () => setFormOpen(false),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF8899]/20 to-[#A78BFA]/20 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-[#FF8899]" />
            </div>
            Potential Merchants
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {total} prospect{total !== 1 ? "s" : ""} in pipeline
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-1">
            {[
              { mode: "table" as const, icon: Table2, label: "Table" },
              { mode: "kanban" as const, icon: Kanban, label: "Kanban" },
              { mode: "cards" as const, icon: LayoutGrid, label: "Cards" },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  viewMode === mode
                    ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
                title={label}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>

          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-bold hover:brightness-110 transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <LeadFilterBar />

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedLeads.size > 0 && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-6 py-3 bg-[#1E1E1E] text-white rounded-2xl shadow-2xl border border-white/10"
          >
            <span className="text-sm font-medium">{selectedLeads.size} selected</span>
            <div className="w-px h-5 bg-white/20" />
            <button
              onClick={() => {
                bulkAction.mutate(
                  { lead_ids: Array.from(selectedLeads), action: "change_status", payload: { status: "contacted" } },
                  { onSuccess: () => clearSelection() }
                );
              }}
              disabled={bulkAction.isPending}
              className="text-sm px-3 py-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              Change Status
            </button>
            <button
              onClick={() => {
                bulkAction.mutate(
                  { lead_ids: Array.from(selectedLeads), action: "assign" },
                  { onSuccess: () => clearSelection() }
                );
              }}
              disabled={bulkAction.isPending}
              className="text-sm px-3 py-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              Assign
            </button>
            <button
              onClick={() => {
                bulkAction.mutate(
                  { lead_ids: Array.from(selectedLeads), action: "delete" },
                  { onSuccess: () => clearSelection() }
                );
              }}
              disabled={bulkAction.isPending}
              className="text-sm px-3 py-1 rounded-lg hover:bg-white/10 transition-colors text-red-400"
            >
              Delete
            </button>
            <div className="w-px h-5 bg-white/20" />
            <button onClick={clearSelection} className="text-sm text-zinc-400 hover:text-white transition-colors">Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">Failed to load leads</h3>
          <p className="text-sm text-[var(--muted)] mb-6 max-w-sm">
            Something went wrong while fetching leads. Please try again.
          </p>
          <button
            onClick={() => setPage(1)}
            className="px-6 py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-bold hover:brightness-110 transition-all"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-64 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--card-bg)] flex items-center justify-center mb-4">
            <UserPlus className="w-8 h-8 text-[var(--muted)]" />
          </div>
          <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">No prospects yet</h3>
          <p className="text-sm text-[var(--muted)] mb-6 max-w-sm">
            Start adding potential merchants to build your sales pipeline.
          </p>
          <button
            onClick={() => setFormOpen(true)}
            className="px-6 py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-bold hover:brightness-110 transition-all"
          >
            Add Your First Lead
          </button>
        </div>
      ) : viewMode === "cards" ? (
        /* Cards View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                isSelected={selectedLeads.has(lead.id)}
                onSelect={() => toggleLead(lead.id)}
                onClick={() => {
                  router.push(`/leads/${lead.id}`);
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : viewMode === "table" ? (
        /* Table View */
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="py-3 px-4 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedLeads.size === leads.length && leads.length > 0}
                    onChange={() =>
                      selectedLeads.size === leads.length
                        ? clearSelection()
                        : selectAll(leads.map((l) => l.id))
                    }
                    className="rounded"
                  />
                </th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Merchant</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Platform</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Followers</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Score</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Est. Orders</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Status</th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">Priority</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const statusCfg = LEAD_STATUS_CONFIG[lead.status];
                const priorityCfg = LEAD_PRIORITY_CONFIG[lead.priority];
                const platformCfg = PLATFORM_CONFIG[lead.platform];
                const tierCfg = LEAD_TIER_CONFIG[lead.tier];

                return (
                  <tr
                    key={lead.id}
                    onClick={() => { router.push(`/leads/${lead.id}`); }}
                    className="border-b border-[var(--card-border)] last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleLead(lead.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--foreground)]">{lead.merchant_name}</div>
                      {lead.management_name && <div className="text-xs text-[var(--muted)]">{lead.management_name}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-medium" style={{ color: platformCfg.color }}>{platformCfg.label}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{lead.follower_count.toLocaleString()}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${tierCfg.color}15`, color: tierCfg.color }}>
                          {tierCfg.label}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${lead.lead_score}%` }} />
                        </div>
                        <span className="text-xs font-bold">{lead.lead_score}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">~{lead.estimated_daily_orders}/d</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: statusCfg.bgColor, color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: priorityCfg.color }} />
                        <span className="text-xs">{priorityCfg.label}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Kanban View */
        <LeadKanban
          leads={leads}
          onStatusChange={(leadId, newStatus) => {
            updateLead.mutate({ id: leadId, data: { status: newStatus } });
          }}
          onLeadClick={(leadId) => {
            router.push(`/leads/${leadId}`);
          }}
        />
      )}

      {/* Pagination (table/cards only) */}
      {viewMode !== "kanban" && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--muted)]">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--card-border)] disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium px-3">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--card-border)] disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Lead Form Dialog */}
      <LeadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreateLead}
        isLoading={createLead.isPending}
      />

      {/* Import Dialog */}
      <LeadImportDialog
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}
