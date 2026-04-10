"use client";

import { useState } from "react";
import { useMerchants } from "@/hooks/use-merchants";
import { useAdminStore } from "@/store/use-admin-store";
import { MerchantCard } from "@/components/merchants/merchant-card";
import { MerchantFilterBar } from "@/components/merchants/merchant-filter-bar";
import { MerchantBulkBar } from "@/components/merchants/merchant-bulk-bar";
import { BulkActionDialog } from "@/components/merchants/bulk-action-dialog";
import { ExportButton } from "@/components/shared/export-button";
import {
  Building2,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

export default function MerchantsPage() {
  const [page, setPage] = useState(1);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const limit = 20;
  const { data, isLoading } = useMerchants(page, limit);

  const {
    viewMode,
    setViewMode,
    selectedMerchants,
    toggleMerchantSelection,
    selectAllMerchants,
    clearSelection,
  } = useAdminStore();

  const merchants = data?.merchants ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const allSelected =
    merchants.length > 0 &&
    merchants.every((m) => selectedMerchants.has(m.id));

  function handleSelectAll() {
    if (allSelected) {
      clearSelection();
    } else {
      selectAllMerchants(merchants.map((m) => m.id));
    }
  }

  function handleBulkAction(action: string) {
    if (action === "export") {
      window.open("/api/export?type=merchants&format=csv");
      return;
    }
    setBulkAction(action);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Merchants
          </h1>
          <p className="text-foreground-muted mt-1">
            {isLoading ? "Loading..." : `${total} merchant${total !== 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Select All */}
          {merchants.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-foreground/60 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-[var(--card-border)] accent-[#1E1E1E]"
              />
              Select all
            </label>
          )}

          <ExportButton type="merchants" />

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 bg-[var(--card-bg)] rounded-xl p-1 border border-[var(--card-border)]">
            <button
              onClick={() => setViewMode("cards")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "cards"
                  ? "bg-[var(--background)] text-foreground shadow-sm"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === "table"
                  ? "bg-[var(--background)] text-foreground shadow-sm"
                  : "text-foreground/40 hover:text-foreground/70"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <MerchantFilterBar />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
        </div>
      ) : merchants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-foreground/40">
          <Building2 className="w-12 h-12 mb-3" />
          <p className="text-lg font-semibold">No merchants found</p>
          <p className="text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {merchants.map((merchant) => (
            <MerchantCard
              key={merchant.id}
              merchant={merchant}
              isSelected={selectedMerchants.has(merchant.id)}
              onToggleSelect={toggleMerchantSelection}
            />
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="pastel-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="p-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-[var(--card-border)] accent-[#1E1E1E]"
                    />
                  </th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">Business</th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">Plan</th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">Status</th>
                  <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">City</th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">Balance</th>
                  <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">Orders</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((m) => {
                  const statusCfg = {
                    active: "bg-green-100 text-green-800",
                    trial: "bg-amber-100 text-amber-800",
                    suspended: "bg-red-100 text-red-800",
                    cancelled: "bg-gray-100 text-gray-600",
                  }[m.status];
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedMerchants.has(m.id)}
                          onChange={() => toggleMerchantSelection(m.id)}
                          className="w-4 h-4 rounded border-[var(--card-border)] accent-[#1E1E1E]"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
                            style={{ backgroundColor: m.branding?.primary_color || "#1E1E1E" }}
                          >
                            {m.business_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{m.business_name}</p>
                            <p className="text-[11px] text-foreground/50 truncate">{m.contact_email || m.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs font-semibold capitalize">{m.plan}</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusCfg}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="p-3 text-foreground/70">{m.city || "\u2014"}</td>
                      <td className="p-3 text-right font-medium">
                        {new Intl.NumberFormat("en-IQ").format(m.wallet?.balance_iqd ?? 0)}
                      </td>
                      <td className="p-3 text-right text-foreground/70">
                        {m.usage?.orders_count ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-xl border border-[var(--card-border)] text-foreground/60 hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-foreground/60">
            Page <span className="font-semibold text-foreground">{page}</span> of{" "}
            <span className="font-semibold text-foreground">{totalPages}</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-xl border border-[var(--card-border)] text-foreground/60 hover:text-foreground hover:border-foreground/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Action Bar */}
      <MerchantBulkBar
        selectedCount={selectedMerchants.size}
        onClearSelection={clearSelection}
        onBulkAction={handleBulkAction}
      />

      <BulkActionDialog
        action={bulkAction}
        selectedCount={selectedMerchants.size}
        selectedIds={[...selectedMerchants]}
        onClose={() => setBulkAction(null)}
        onSuccess={() => clearSelection()}
      />
    </div>
  );
}
