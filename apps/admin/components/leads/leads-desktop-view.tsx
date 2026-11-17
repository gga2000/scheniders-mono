"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLeads } from "@/hooks/use-leads";
import { useLeadAnalytics } from "@/hooks/use-lead-analytics";
import { useLeadsTableLayout } from "@/hooks/use-leads-table-layout";
import {
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
} from "@/hooks/use-lead-mutations";
import { useLeadStore } from "@/store/use-lead-store";
import { useAdminAuth, useCan } from "@/hooks/use-admin-auth";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import { LeadForm } from "@/components/leads/lead-form";
import { LeadBulkBar } from "@/components/leads/lead-bulk-bar";
import { LeadCard } from "@/components/leads/lead-card";
import { LeadKanban } from "@/components/leads/lead-kanban";
import { LeadImportDialog } from "@/components/leads/lead-import-dialog";
import { LeadsTable } from "@/components/leads/leads-table";
import { leadToFormData, DRAFT_PLACEHOLDER_NAME } from "@/components/leads/lead-form-data";
import type { LeadFormData, Lead } from "@/types/leads";
import { leadPhone, toIntlIraqi } from "./lead-phone";
import { leadsCountLine } from "./leads-count";
import { toast } from "sonner";
import {
  UserPlus,
  Upload,
  LayoutGrid,
  Kanban,
  Table2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { formatCount } from "@/lib/format";


export function LeadsDesktopView() {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [draftLead, setDraftLead] = useState<Lead | null>(null);
  // Column-edit mode is owned here so the "Edit columns" button can sit in the
  // filter row; <LeadsTable> consumes it. super_admin only (the route 403s others).
  const [columnsEditing, setColumnsEditing] = useState(false);

  const { role } = useAdminAuth();
  const can = useCan();
  const canEditLayout = role === "super_admin";

  const { page, setPage, viewMode, setViewMode, selectedLeads, toggleLead, selectAll, clearSelection } =
    useLeadStore();

  // Leave edit mode if the table view is no longer active.
  useEffect(() => {
    if (viewMode !== "table") setColumnsEditing(false);
  }, [viewMode]);
  const { data, isLoading, isError, refetch } = useLeads(page, viewMode === "kanban" ? 100 : 20);
  // The table's shared column layout is read with the page, beside the leads,
  // and the table waits for it: read only once the table drew, it arrived
  // seconds later and moved every column under the pointer. A failed read
  // stops the wait, and the table uses the default columns.
  const layout = useLeadsTableLayout();
  const waitingForColumns = viewMode === "table" && layout.isPending;
  const { data: analytics, isError: analyticsFailed, refetch: refetchAnalytics, isFetching: analyticsRetrying } = useLeadAnalytics();
  // While loading "...", after a failed read a dash and a line that says so: never a number that is not known.
  const leadNumber = (pick: (a: NonNullable<typeof analytics>) => number) =>
    analytics ? formatCount(pick(analytics)) : analyticsFailed ? "—" : "...";
  const lastTrend = analytics?.monthly_trends?.[analytics.monthly_trends.length - 1];
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  // A refused save rejects with the server's words; the form shows them.
  const handleCreateLead = (formData: LeadFormData) => createLead.mutateAsync(formData).then(() => true);

  // Auto-save an in-progress lead as a draft when the form is dismissed.
  const handleSaveDraft = (formData: LeadFormData) =>
    createLead.mutate(
      {
        ...formData,
        merchant_name: formData.merchant_name.trim() || DRAFT_PLACEHOLDER_NAME,
        is_draft: true,
      },
      {
        onSuccess: (res) => {
          const id = res?.lead?.id as string | undefined;
          // Deleting needs delete_leads (api/leads/[id]): offer Discard only to a login that has it.
          const discard = id && can("delete_leads") ? id : null;
          toast.success("Saved as draft", {
            description: discard ? "Find it in your list, or discard it." : "Find it in your list.",
            action: discard
              ? {
                  label: "Discard",
                  onClick: () =>
                    deleteLead.mutate(discard, { onError: (e) => toast.error(`Could not discard the draft: ${e.message}`) }),
                }
              : undefined,
          });
        },
        onError: () => toast.error("Couldn't save the draft"),
      },
    );

  // Drafts reopen the editor (resume); real leads open their detail page.
  const openLead = (lead: Lead) => {
    if (lead.is_draft) setDraftLead(lead);
    else router.push(`/leads/${lead.id}`);
  };

  // Quick row actions, shared by the table and the cards view.
  const handleQuickCall = useCallback((lead: Lead) => {
    const p = leadPhone(lead);
    if (p) window.location.href = `tel:${p}`;
    else toast.info("No phone number on file");
  }, []);
  const handleQuickWhatsApp = useCallback((lead: Lead) => {
    const p = leadPhone(lead);
    const intl = p && toIntlIraqi(p);
    if (intl) window.open(`https://wa.me/${intl}`, "_blank");
    else toast.info("No WhatsApp number on file");
  }, []);


  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">Leads</h1>
          <p className="text-[13px] text-foreground/70">
            {leadsCountLine({ count: data?.total, isError })}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
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
                    ? "bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]",
                )}
                title={label}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--card-border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </button>

          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Headline numbers in one surface (board v6), each naming its window. */}
      <NumberStrip columns={4} label="Lead numbers">
        <NumberCell
          label="Leads, now"
          value={leadNumber((a) => a.total_leads)}
          note={lastTrend ? `${formatCount(lastTrend.added)} added this month` : undefined}
        />
        <NumberCell
          label="New, not contacted yet"
          value={leadNumber((a) => a.by_status.new ?? 0)}
        />
        <NumberCell
          label="Interested or store built, now"
          value={leadNumber((a) => (a.by_status.interested ?? 0) + (a.by_status.store_built ?? 0))}
        />
        <NumberCell
          label="Converted, all time"
          value={leadNumber((a) => a.by_status.converted ?? 0)}
          note={analytics ? `${analytics.conversion_rate.toFixed(1)}% of all leads` : undefined}
        />
      </NumberStrip>
      {analyticsFailed && !analytics && (
        <p className="-mt-2 flex items-center gap-2 text-xs text-[var(--ink-red)]" role="alert">
          Could not load the lead numbers.
          <button
            type="button"
            onClick={() => refetchAnalytics()}
            disabled={analyticsRetrying}
            className="font-semibold underline disabled:opacity-50"
          >
            {analyticsRetrying ? "Loading" : "Try again"}
          </button>
        </p>
      )}

      {/* Workspace Panel */}
      <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-[var(--card-border)]">
          <LeadFilterBar
            actions={
              canEditLayout && viewMode === "table" && !columnsEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    clearSelection();
                    setColumnsEditing(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
                  title="Reorder, resize, and show/hide columns for everyone"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Edit columns
                </button>
              ) : null
            }
          />
        </div>

        {/* Content */}
        {isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-[var(--ink-red)]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">Failed to load leads</h3>
            <p className="text-sm text-[var(--muted)] mb-6 max-w-sm">
              Something went wrong while fetching leads. Please try again.
            </p>
            <button
              onClick={() => void refetch()}
              className="px-6 py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] text-sm font-bold hover:brightness-110 transition-all"
            >
              Retry
            </button>
          </div>
        ) : isLoading || waitingForColumns ? (
          viewMode === "table" ? (
            <div className="divide-y divide-[var(--card-border)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-[var(--card-border)]/40 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 rounded bg-[var(--card-border)]/40 animate-pulse" />
                    <div className="h-2.5 w-24 rounded bg-[var(--card-border)]/30 animate-pulse" />
                  </div>
                  <div className="h-5 w-16 rounded-full bg-[var(--card-border)]/40 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl animate-pulse"
                />
              ))}
            </div>
          )
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-foreground/[0.05] flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-[#FF8899]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">No leads yet</h3>
            <p className="text-sm text-[var(--muted)] mb-6 max-w-sm">
              Start adding potential merchants to build your sales pipeline.
            </p>
            <button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background text-sm font-bold hover:opacity-90 transition-all shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Add Your First Lead
            </button>
          </div>
        ) : viewMode === "cards" ? (
          /* Cards View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            <AnimatePresence mode="popLayout">
              {leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  isSelected={selectedLeads.has(lead.id)}
                  onSelect={() => toggleLead(lead.id)}
                  onClick={() => openLead(lead)}
                  onQuickCall={() => handleQuickCall(lead)}
                  onQuickWhatsApp={() => handleQuickWhatsApp(lead)}
                  onQuickNote={() => router.push(`/leads/${lead.id}`)}
                />
              ))}
            </AnimatePresence>
            {/* Ghost add-card keeps the grid balanced + offers a quick add */}
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex flex-col items-center justify-center gap-2 min-h-[260px] rounded-2xl border-2 border-dashed border-[var(--card-border)] text-[var(--muted)] hover:border-[#A78BFA]/50 hover:text-[#A78BFA] hover:bg-[#A78BFA]/[0.03] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[var(--card-bg)] flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold">Add Lead</span>
            </button>
          </div>
        ) : viewMode === "table" ? (
          /* Table View — columns are admin-configurable (see LeadsTable) */
          <LeadsTable
            leads={leads}
            onOpenLead={openLead}
            onQuickCall={handleQuickCall}
            onQuickWhatsApp={handleQuickWhatsApp}
            editing={canEditLayout && columnsEditing}
            onEditingChange={setColumnsEditing}
          />
        ) : (
          /* Kanban View */
          <div className="p-4">
            <LeadKanban
              leads={leads}
              onStatusChange={(leadId, newStatus) => {
                updateLead.mutate({ id: leadId, data: { status: newStatus } });
              }}
              onLeadClick={(leadId) => {
                const l = leads.find((x) => x.id === leadId);
                if (l) openLead(l);
                else router.push(`/leads/${leadId}`);
              }}
            />
            {/* The board holds one page of leads; say so when there are more. */}
            {total > leads.length && (
              <p className="mt-3 text-xs text-foreground/70">
                Showing {formatCount(leads.length)} of {formatCount(total)} leads. Search or filter to find the rest.
              </p>
            )}
          </div>
        )}

        {/* Pagination (table/cards only) */}
        {viewMode !== "kanban" && totalPages > 1 && !isLoading && !isError && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--card-border)]">
            <p className="text-sm text-[var(--muted)]">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--card-border)] disabled:opacity-30 hover:bg-[var(--background)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-3 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--card-border)] disabled:opacity-30 hover:bg-[var(--background)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedLeads.size > 0 && (
          <LeadBulkBar selectedIds={Array.from(selectedLeads)} role={role} onClear={clearSelection} />
        )}
      </AnimatePresence>

      {/* Lead Form Dialog — accidental exit auto-saves a draft */}
      <LeadForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreateLead}
        onSaveDraft={handleSaveDraft}
      />

      {/* Resume an in-progress draft — saving promotes it to a real lead */}
      <LeadForm
        key={draftLead?.id ?? "no-draft"}
        open={!!draftLead}
        onOpenChange={(v) => {
          if (!v) setDraftLead(null);
        }}
        initialData={draftLead ? leadToFormData(draftLead) : undefined}
        onSubmit={(_, changes) =>
          draftLead
            ? updateLead.mutateAsync({ id: draftLead.id, data: { ...changes, is_draft: false } }).then(() => true)
            : false
        }
        onSaveDraft={(data) => {
          if (!draftLead) return;
          updateLead.mutate({ id: draftLead.id, data: { ...data, is_draft: true } });
        }}
      />

      {/* Import Dialog */}
      <LeadImportDialog isOpen={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
