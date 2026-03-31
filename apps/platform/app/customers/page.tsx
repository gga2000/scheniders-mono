"use client";

import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { usePaginatedCustomers } from "@/hooks/use-paginated-customers";
import { useCustomerStore } from "@/store/use-customer-store";
import { CustomerStatsStrip } from "@/components/customers/list/customer-stats-strip";
import { CustomerFilterSidebar } from "@/components/customers/list/customer-filter-sidebar";
import { CustomerTable } from "@/components/customers/list/customer-table";
import { CustomerBulkBar } from "@/components/customers/list/customer-bulk-bar";
import { BulkTagModal } from "@/components/customers/bulk-tag-modal";
import { BroadcastModal } from "@/components/customers/broadcast-modal";
import { useCustomerBulkActions } from "@/hooks/use-bulk-actions";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const PAGE_LIMIT = 25;

// Lazily load the dashboard stats
const CustomerDashboardMetrics = dynamic(
  () => import("@/components/customers/dashboard-metrics").then(m => ({ default: m.CustomerDashboardMetrics })),
  { ssr: false }
);

export default function CustomersPage() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [isTagModalOpen, setTagModalOpen] = useState(false);
  const [isBroadcastModalOpen, setBroadcastModalOpen] = useState(false);

  const { state, rawSearch, setSearch, setStatus, setCity, setSort } = useCustomerUrlState();
  const { selectedPhones, togglePhoneSelection, selectAllPhones, clearPhoneSelection } = useCustomerStore();

  // Extended filter state (not in URL hook yet, handled locally)
  const [lastOrderDays, setLastOrderDays] = useState<number | undefined>(state.lastOrderWithinDays);
  const [minLtv, setMinLtv] = useState<number | undefined>(state.minLtv);
  const [maxLtv, setMaxLtv] = useState<number | undefined>(state.maxLtv);

  const filters = useMemo(() => ({
    search: state.search,
    status: state.status,
    city: state.city,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    lastOrderWithinDays: lastOrderDays,
    minLtv,
    maxLtv,
  }), [state, lastOrderDays, minLtv, maxLtv]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = usePaginatedCustomers(PAGE_LIMIT, filters);

  const allCustomers = useMemo(
    () => data?.pages.flatMap(p => p.customers) ?? [],
    [data]
  );
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  // Distinct cities from loaded data
  const cities = useMemo(() => {
    const seen = new Set<string>();
    allCustomers.forEach(c => {
      if (c.governorate) seen.add(c.governorate);
      if (c.city) seen.add(c.city);
    });
    return [...seen].sort();
  }, [allCustomers]);

  // Derived stats
  const vipCount = useMemo(() => allCustomers.filter(c => c.calculated_status === "vip").length, [allCustomers]);
  const totalRevenue = useMemo(() => allCustomers.reduce((s, c) => s + c.total_spent, 0), [allCustomers]);
  const atRiskCount = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return allCustomers.filter(c => c.last_order_date && new Date(c.last_order_date) < cutoff).length;
  }, [allCustomers]);

  const handleSelectAll = useCallback(() => {
    selectAllPhones(allCustomers.map(c => c.phone));
  }, [allCustomers, selectAllPhones]);

  function handleExport() {
    const rows = allCustomers.filter(c => selectedPhones.has(c.phone));
    const csv = [
      ["الاسم", "الهاتف", "الحالة", "المدينة", "الطلبات", "الإنفاق"],
      ...rows.map(c => [c.name, c.phone, c.calculated_status, c.city || "", c.total_orders, c.total_spent]),
    ].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "customers.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-(--card-border) bg-(--card-bg) px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">العملاء</h1>
            {totalCount > 0 && (
              <p className="text-xs text-muted mt-0.5">
                {totalCount.toLocaleString("ar-IQ")} عميل مسجل
              </p>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
            <input
              type="search"
              value={rawSearch}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="w-full rounded-2xl border border-(--card-border) bg-background py-2 pr-9 pl-3 text-sm text-foreground placeholder:text-muted focus:border-(--border-hover) focus:bg-(--card-bg) focus:outline-none focus:ring-2 focus:ring-(--pastel-blue) transition-all"
            />
            {rawSearch && (
              <button
                onClick={() => setSearch("")}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter toggle (mobile) */}
          <button
            onClick={() => setFilterOpen(true)}
            className="lg:hidden flex items-center gap-1.5 rounded-2xl border border-(--card-border) bg-(--card-bg) px-3 py-2 text-sm font-medium text-muted hover:bg-background transition-colors"
          >
            <SlidersHorizontal className="h-4 w-4" />
            فلترة
          </button>
        </div>

        {/* Stats Strip */}
        <div className="mt-4">
          <CustomerStatsStrip
            totalCustomers={totalCount}
            vipCustomers={vipCount}
            totalRevenue={totalRevenue}
            atRiskCustomers={atRiskCount}
          />
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Filter Sidebar */}
        <CustomerFilterSidebar
          status={(state.status as any) || "all"}
          onStatusChange={s => setStatus(s as any)}
          city={state.city || ""}
          onCityChange={setCity}
          lastOrderDays={lastOrderDays}
          onLastOrderDaysChange={setLastOrderDays}
          minLtv={minLtv}
          maxLtv={maxLtv}
          onLtvChange={(min, max) => { setMinLtv(min); setMaxLtv(max); }}
          cities={cities}
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
        />

        {/* Main content */}
        <main className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          <CustomerTable
            customers={allCustomers}
            selectedPhones={selectedPhones}
            onSelect={togglePhoneSelection}
            onSelectAll={handleSelectAll}
            onClearAll={clearPhoneSelection}
            sortBy={state.sortBy as any}
            sortOrder={state.sortOrder as any}
            onSort={(field) => setSort(field, state.sortBy === field && state.sortOrder === "asc" ? "desc" : "asc")}
            isLoading={isLoading}
            hasNextPage={hasNextPage}
            onLoadMore={fetchNextPage}
            isFetchingNextPage={isFetchingNextPage}
          />
        </main>
      </div>

      {/* ── Bulk Action Bar ───────────────────────────────────── */}
      <CustomerBulkBar
        selectedCount={selectedPhones.size}
        onExport={handleExport}
        onAddTag={() => setTagModalOpen(true)}
        onBroadcast={() => setBroadcastModalOpen(true)}
        onClear={clearPhoneSelection}
      />

      {/* Modals */}
      {isTagModalOpen && (
        <BulkTagModal
          isOpen={isTagModalOpen}
          onClose={() => setTagModalOpen(false)}
          onConfirm={async () => setTagModalOpen(false)}
          selectedCount={selectedPhones.size}
        />
      )}
      {isBroadcastModalOpen && (
        <BroadcastModal
          isOpen={isBroadcastModalOpen}
          onClose={() => setBroadcastModalOpen(false)}
          selectedCount={selectedPhones.size}
          selectedPhones={[...selectedPhones]}
        />
      )}
    </div>
  );
}
