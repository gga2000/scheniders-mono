"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLeads } from "@/hooks/use-leads";
import { useLeadAnalytics } from "@/hooks/use-lead-analytics";
import {
  useCreateLead,
  useUpdateLead,
  useDeleteLead,
  useBulkLeadAction,
} from "@/hooks/use-lead-mutations";
import { useLeadStore } from "@/store/use-lead-store";
import { usePageHeader } from "@/store/use-page-header";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { LeadFilterBar } from "@/components/leads/lead-filter-bar";
import { LeadForm } from "@/components/leads/lead-form";
import { LeadCard } from "@/components/leads/lead-card";
import { LeadKanban } from "@/components/leads/lead-kanban";
import { LeadImportDialog } from "@/components/leads/lead-import-dialog";
import { LeadsTable } from "@/components/leads/leads-table";
import { leadToFormData, DRAFT_PLACEHOLDER_NAME } from "@/components/leads/lead-form-data";
import type { LeadFormData, Lead } from "@/types/leads";
import { leadPhone, toIntlIraqi } from "./lead-phone";
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
  Users,
  Sparkles,
  Flame,
  Store,
  CheckCircle2,
  Percent,
  Wallet,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/** Compact IQD formatter for tight KPI tiles. */
function compactIQD(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${v}`;
}

const countFmt = (n: number) => Math.round(n).toLocaleString();

/** Animated count-up that eases from 0 → value on mount / value change. */
function CountUp({
  value,
  format,
}: {
  value: number | null;
  format: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (value == null) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const to = value;
    const duration = 750;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(to * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  if (value == null) return <>—</>;
  return <>{format(display)}</>;
}

export function LeadsDesktopView() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [draftLead, setDraftLead] = useState<Lead | null>(null);
  // Column-edit mode is owned here so the "Edit columns" button can sit in the
  // filter row; <LeadsTable> consumes it. super_admin only (the route 403s others).
  const [columnsEditing, setColumnsEditing] = useState(false);

  const { role } = useAdminAuth();
  const canEditLayout = role === "super_admin";

  const { viewMode, setViewMode, selectedLeads, toggleLead, selectAll, clearSelection } =
    useLeadStore();

  // Leave edit mode if the table view is no longer active.
  useEffect(() => {
    if (viewMode !== "table") setColumnsEditing(false);
  }, [viewMode]);
  const { data, isLoading, isError } = useLeads(page, viewMode === "kanban" ? 100 : 20);
  const { data: analytics, isLoading: analyticsLoading } = useLeadAnalytics();
  const kpiLoading = analyticsLoading && !analytics;
  const lastTrend = analytics?.monthly_trends?.[analytics.monthly_trends.length - 1];
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const bulkAction = useBulkLeadAction();

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  // Publish the page header (title + live pipeline count) to the global topbar.
  const setPageHeader = usePageHeader((s) => s.setHeader);
  const clearPageHeader = usePageHeader((s) => s.clearHeader);
  useEffect(() => {
    setPageHeader({
      title: "Prospects",
      subtitle: `${total.toLocaleString()} ${total === 1 ? "prospect" : "prospects"} in pipeline`,
    });
    return () => clearPageHeader();
  }, [total, setPageHeader, clearPageHeader]);

  const handleCreateLead = (formData: LeadFormData) =>
    new Promise<boolean>((resolve) => {
      createLead.mutate(formData, {
        onSuccess: () => resolve(true),
        onError: () => resolve(false),
      });
    });

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
          toast.success("Saved as draft", {
            description: "Find it in your list — or discard it.",
            action: id ? { label: "Discard", onClick: () => deleteLead.mutate(id) } : undefined,
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

  const kpis: {
    label: string;
    raw: number | null;
    format: (n: number) => string;
    suffix?: string;
    trend?: number;
    icon: LucideIcon;
    color: string;
  }[] = [
    { label: "Pipeline", raw: analytics?.total_leads ?? null, format: countFmt, trend: lastTrend?.added, icon: Users, color: "#7C3AED" },
    { label: "New", raw: analytics ? (analytics.by_status.new ?? 0) : null, format: countFmt, icon: Sparkles, color: "#D97706" },
    { label: "Interested", raw: analytics ? (analytics.by_status.interested ?? 0) : null, format: countFmt, icon: Flame, color: "#2563EB" },
    { label: "Store Built", raw: analytics ? (analytics.by_status.store_built ?? 0) : null, format: countFmt, icon: Store, color: "#7C3AED" },
    { label: "Converted", raw: analytics ? (analytics.by_status.converted ?? 0) : null, format: countFmt, trend: lastTrend?.converted, icon: CheckCircle2, color: "#16A34A" },
    { label: "Conv. Rate", raw: analytics?.conversion_rate ?? null, format: (n: number) => `${Math.round(n)}%`, icon: Percent, color: "#D97706" },
    {
      label: "Est. Revenue",
      raw: analytics?.total_estimated_revenue ?? null,
      format: (n: number) => compactIQD(Math.round(n)),
      suffix: "IQD/mo",
      icon: Wallet,
      color: "#16A34A",
    },
  ];

  return (
    <div className="space-y-5 p-5 sm:p-6">
      {/* Toolbar — title + "prospects in pipeline" now live in the global topbar */}
      <div className="flex items-center justify-end gap-4">
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
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF8899] to-[#A78BFA] text-white text-sm font-bold hover:brightness-105 transition-all shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* KPI Pipeline Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="group rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3.5 flex items-center gap-3 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-[transform,box-shadow]"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105"
              style={{ backgroundColor: kpi.color }}
            >
              <kpi.icon className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <div className="text-xl font-bold text-[var(--foreground)] leading-tight tabular-nums truncate">
                  {kpiLoading ? (
                    <span className="inline-block h-5 w-10 rounded-md bg-[var(--card-border)]/60 animate-pulse align-middle" />
                  ) : (
                    <>
                      <CountUp value={kpi.raw} format={kpi.format} />
                      {kpi.suffix && (
                        <span className="text-[10px] font-medium text-[var(--muted)] ml-1">
                          {kpi.suffix}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {!kpiLoading && kpi.trend != null && kpi.trend > 0 && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    ↑{kpi.trend}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--muted)] truncate">{kpi.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

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
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF8899]/15 to-[#A78BFA]/15 flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-[#FF8899]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">No prospects yet</h3>
            <p className="text-sm text-[var(--muted)] mb-6 max-w-sm">
              Start adding potential merchants to build your sales pipeline.
            </p>
            <button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#FF8899] to-[#A78BFA] text-white text-sm font-bold hover:brightness-105 transition-all shadow-sm"
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
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-9 h-9 rounded-xl flex items-center justify-center border border-[var(--card-border)] disabled:opacity-30 hover:bg-[var(--background)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-3 tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
                  {
                    lead_ids: Array.from(selectedLeads),
                    action: "change_status",
                    payload: { status: "contacted" },
                  },
                  { onSuccess: () => clearSelection() },
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
                  { onSuccess: () => clearSelection() },
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
                  { onSuccess: () => clearSelection() },
                );
              }}
              disabled={bulkAction.isPending}
              className="text-sm px-3 py-1 rounded-lg hover:bg-white/10 transition-colors text-red-400"
            >
              Delete
            </button>
            <div className="w-px h-5 bg-white/20" />
            <button
              onClick={clearSelection}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          </motion.div>
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
        onSubmit={(data) =>
          new Promise<boolean>((resolve) => {
            if (!draftLead) return resolve(false);
            updateLead.mutate(
              { id: draftLead.id, data: { ...data, is_draft: false } },
              { onSuccess: () => resolve(true), onError: () => resolve(false) },
            );
          })
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
