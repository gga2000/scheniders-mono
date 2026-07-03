"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { motion } from "framer-motion";
import { Search, Upload, Download, Plus } from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { usePaginatedCustomers, useCustomerDashboardStats, type PaginatedCustomerFilters } from "@/hooks/use-paginated-customers";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { useCustomerStore } from "@/store/use-customer-store";
import { CustomerInsightStrip } from "@/components/customers/list/customer-insight-strip";
import { CustomerActionLane, type LaneSegment } from "@/components/customers/list/customer-action-lane";
import { CustomerSegmentTabs, activeSegment, type SegmentState } from "@/components/customers/list/customer-segment-tabs";
import { CustomerToolbar } from "@/components/customers/list/customer-toolbar";
import {
    CustomerFilterChips, valueCounts, riskCounts, type ValueFilter, type RiskFilter,
} from "@/components/customers/list/customer-filter-chips";
import { CustomerGrid } from "@/components/customers/list/customer-grid";
import { CustomerListTable } from "@/components/customers/list/customer-list-table";
import { CustomerBulkBar } from "@/components/customers/list/customer-bulk-bar";
import { CustomerDetailDialog } from "@/components/customers/customer-detail-dialog";
import { BroadcastModal } from "@/components/customers/broadcast-modal";
import { BulkTagModal } from "@/components/customers/bulk-tag-modal";
import { useCustomerBulkActions } from "@/hooks/use-bulk-actions";
import { pct, toIraqE164 } from "@/lib/customer-format";

const PAGE_LIMIT = 24;

function CustomersPageContent() {
    const { t, language } = useLanguage();
    const { state, rawSearch, setSearch, setSort, setView } = useCustomerUrlState();
    const { viewMode, setViewMode } = useCustomerStore();

    // Two independent server-side axes + the client-only action-lane cohorts.
    const [valueFilter, setValueFilter] = useState<ValueFilter>("all");
    const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
    const [laneFilter, setLaneFilter] = useState<LaneSegment | null>(null);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

    // Multi-select for bulk actions (deep-link broadcast, tag, export).
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [showBulkTag, setShowBulkTag] = useState(false);
    const { bulkAddTags } = useCustomerBulkActions();

    const filters = useMemo(() => {
        const f: PaginatedCustomerFilters = {
            search: state.search,
            city: state.city,
            sortBy: state.sortBy as any,
            sortOrder: state.sortOrder,
            valueFilter: valueFilter === "all" ? undefined : valueFilter,
            riskFilter: riskFilter === "all" ? undefined : riskFilter,
        };
        // Action-lane cohorts now filter server-side (exact across the whole cohort).
        if (laneFilter === "vipsQuiet") { f.valueFilter = "vip"; f.lastOrderBeforeDays = 30; }
        else if (laneFilter === "new") { f.firstOrderWithinDays = 30; }
        else if (laneFilter === "firstDelivery") { f.firstDeliveryPending = true; }
        return f;
    }, [state.search, state.city, state.sortBy, state.sortOrder, valueFilter, riskFilter, laneFilter]);

    const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = usePaginatedCustomers(PAGE_LIMIT, filters);
    const { data: stats } = useCustomerDashboardStats();

    const allCustomers = useMemo(() => data?.pages.flatMap((p) => p.customers) || [], [data]);
    const totalCount = data?.pages[0]?.totalCount || 0;
    const effectiveView = state.view || viewMode;

    // Everything (value/risk chips + action-lane cohorts) now filters server-side.
    const displayed = allCustomers;

    const selectedCustomer = useMemo(
        () => allCustomers.find((c) => c.phone === selectedPhone) ?? null,
        [allCustomers, selectedPhone],
    );

    const handleCustomerClick = useCallback((phone: string) => {
        setSelectedPhone(phone);
    }, []);

    const toggleSelect = useCallback((phone: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(phone)) next.delete(phone); else next.add(phone);
            return next;
        });
    }, []);
    const clearSelected = useCallback(() => setSelected(new Set()), []);
    const selectedPhones = useMemo(() => Array.from(selected), [selected]);

    const exportSelected = useCallback(() => {
        const rows = allCustomers.filter((c) => selected.has(c.phone));
        const header = [
            t("customers.export.name", "Name"), t("customers.export.phone", "Phone"),
            t("customers.export.governorate", "Governorate"), t("customers.export.orders", "Orders"),
            t("customers.export.value", "Value"), t("customers.export.risk", "COD risk"),
        ];
        const body = rows.map((c) => [
            c.name, c.phone, c.governorate ? governorateLabel(c.governorate, language) || c.governorate : "",
            String(c.total_orders ?? 0), t(`customers.value.${c.value_tier}`, c.value_tier), t(`customers.risk.${c.risk_level}`, c.risk_level),
        ]);
        const csv = [header, ...body].map((r) => r.map((cell) => {
            const v = String(cell ?? "");
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(",")).join("\n");
        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `customers-selected-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [allCustomers, selected, t, language]);

    const onConfirmTags = useCallback(async (tagIds: string[]) => {
        await bulkAddTags(selectedPhones, tagIds);
        setShowBulkTag(false);
        clearSelected();
    }, [bulkAddTags, selectedPhones, clearSelected]);

    const onValue = useCallback((next: ValueFilter) => {
        setValueFilter(next);
        setLaneFilter(null);
    }, []);

    const onRisk = useCallback((next: RiskFilter) => {
        setRiskFilter(next);
        setLaneFilter(null);
    }, []);

    const onSegmentSelect = useCallback((s: SegmentState) => {
        setValueFilter(s.value);
        setRiskFilter(s.risk);
        setLaneFilter(s.lane);
        if (s.sort) setSort(s.sort.by as any, s.sort.order);
    }, [setSort]);

    const onSegment = useCallback((kind: LaneSegment) => {
        // "High COD risk" maps to the server-side risk filter so the whole cohort loads.
        if (kind === "risky") {
            setRiskFilter((prev) => (prev === "high" ? "all" : "high"));
            setLaneFilter(null);
            return;
        }
        setLaneFilter((prev) => (prev === kind ? null : kind));
        setValueFilter("all");
        setRiskFilter("all");
    }, []);

    // Export the ENTIRE filtered set (not just loaded pages), locale-aware header.
    const exportCsv = useCallback(async () => {
        const { data: rows, error } = await supabase.rpc("get_paginated_customers", {
            search_query: filters.search || null,
            city_filter: filters.city || null,
            sort_by: (filters.sortBy as string) || "last_order_date",
            sort_desc: filters.sortOrder !== "asc",
            page_limit: Math.max(totalCount, 1),
            page_offset: 0,
            value_filter: filters.valueFilter ?? null,
            risk_filter: filters.riskFilter ?? null,
        });
        if (error) { console.error("Export failed:", error); return; }
        const list = (rows as any[]) ?? [];
        const header = [
            t("customers.export.name", "Name"), t("customers.export.phone", "Phone"),
            t("customers.export.governorate", "Governorate"), t("customers.export.orders", "Orders"),
            t("customers.export.completed", "Completed"), t("customers.export.spent", "Total spent"),
            t("customers.export.value", "Value"), t("customers.export.risk", "COD risk"),
            t("customers.export.lastOrder", "Last order"), t("customers.export.firstOrder", "First order"),
        ];
        const body = list.map((c) => [
            c.name ?? "", c.phone ?? "",
            c.governorate ? governorateLabel(c.governorate, language) || c.governorate : "",
            String(c.total_orders ?? 0), String(c.completed_count ?? 0), String(c.total_spent ?? 0),
            t(`customers.value.${c.value_tier}`, c.value_tier), t(`customers.risk.${c.risk_level}`, c.risk_level),
            c.last_order_date || "", c.first_order_date || "",
        ]);
        const csv = [header, ...body].map((r) => r.map((cell) => {
            const v = String(cell ?? "");
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(",")).join("\n");
        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [filters, totalCount, t, language]);

    const repeatPct = stats ? pct(stats.repeat_customer_count, stats.total_customers) : 0;

    return (
        <div className="customers-page min-h-screen p-6 md:p-8 bg-background">
            <div className="max-w-[1920px] mx-auto space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                >
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{t("customers.title")}</h1>
                        <p className="text-muted-foreground mt-2 text-[15px]">
                            {stats
                                ? t("customers.subtitle", { count: stats.total_customers.toLocaleString("en-US"), repeat: String(repeatPct) })
                                : `${totalCount.toLocaleString("en-US")}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <button className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border border-(--card-border) bg-(--card-bg) text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors">
                            <Upload className="w-4 h-4" /> {t("customers.import")}
                        </button>
                        <button
                            onClick={exportCsv}
                            disabled={totalCount === 0}
                            className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border border-(--card-border) bg-(--card-bg) text-sm font-semibold text-foreground hover:bg-muted/30 disabled:opacity-40 transition-colors"
                        >
                            <Download className="w-4 h-4" /> {t("customers.export")}
                        </button>
                        <button className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-(--button-success) text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-[0_6px_16px_-6px_rgba(34,197,94,0.5)]">
                            <Plus className="w-4 h-4" /> {t("customers.addCustomer")}
                        </button>
                    </div>
                </motion.div>

                {/* Insight strip */}
                {stats && <CustomerInsightStrip stats={stats} />}

                {/* Action lane */}
                {stats && <CustomerActionLane stats={stats} activeSegment={laneFilter ?? (riskFilter === "high" ? "risky" : null)} onSegment={onSegment} />}

                {/* Smart segment tabs */}
                {stats && (
                    <CustomerSegmentTabs
                        stats={stats}
                        active={activeSegment({ value: valueFilter, risk: riskFilter, lane: laneFilter })}
                        onSelect={onSegmentSelect}
                    />
                )}

                {/* Toolbar + filter chips */}
                <CustomerToolbar
                    search={rawSearch}
                    onSearch={setSearch}
                    sortBy={state.sortBy || "total_orders"}
                    sortOrder={state.sortOrder || "desc"}
                    onSort={(sb, so) => setSort(sb as any, so)}
                    view={effectiveView}
                    onView={(mode) => { setViewMode(mode); setView(mode); }}
                >
                    <CustomerFilterChips
                        value={valueFilter}
                        risk={riskFilter}
                        total={stats?.total_customers ?? totalCount}
                        vCounts={stats ? valueCounts(stats) : {}}
                        rCounts={stats ? riskCounts(stats) : {}}
                        onValue={onValue}
                        onRisk={onRisk}
                    />
                </CustomerToolbar>

                {/* Content */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="bg-(--card-bg) rounded-3xl border border-(--card-border) p-6 h-44 animate-pulse" />
                        ))}
                    </div>
                ) : displayed.length === 0 ? (
                    <div className="bg-(--card-bg) rounded-3xl border border-(--card-border) p-12 text-center">
                        <div className="mx-auto w-14 h-14 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
                            <Search className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-bold text-foreground mb-1">{t("customers.noCustomers")}</p>
                        <p className="text-sm text-muted-foreground">{t("customers.adjustFilters")}</p>
                    </div>
                ) : (
                    <>
                        {effectiveView === "list" ? (
                            <CustomerListTable customers={displayed} onRowClick={handleCustomerClick} selectedPhones={selected} onToggleSelect={toggleSelect} />
                        ) : (
                            <CustomerGrid customers={displayed} onCustomerClick={handleCustomerClick} selectedPhones={selected} onToggleSelect={toggleSelect} />
                        )}
                        {hasNextPage && (
                            <div className="flex justify-center pt-2">
                                <button
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="h-11 px-6 rounded-2xl border border-(--card-border) bg-(--card-bg) text-sm font-semibold text-foreground hover:bg-muted/30 disabled:opacity-50 transition-colors"
                                >
                                    {isFetchingNextPage ? "…" : t("common.loadMore", "Load more")}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <CustomerDetailDialog customer={selectedCustomer} onClose={() => setSelectedPhone(null)} />

            {/* Bulk actions */}
            <CustomerBulkBar
                selectedCount={selected.size}
                onExport={exportSelected}
                onAddTag={() => setShowBulkTag(true)}
                onBroadcast={() => setShowBroadcast(true)}
                onClear={clearSelected}
            />
            <BroadcastModal
                isOpen={showBroadcast}
                onClose={() => setShowBroadcast(false)}
                selectedCount={selected.size}
                selectedPhones={selectedPhones.map(toIraqE164)}
            />
            <BulkTagModal
                isOpen={showBulkTag}
                onClose={() => setShowBulkTag(false)}
                onConfirm={onConfirmTags}
                selectedCount={selected.size}
            />
        </div>
    );
}

export default function CustomersPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
        }>
            <CustomersPageContent />
        </Suspense>
    );
}
