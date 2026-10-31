"use client";

import Link from "next/link";
import { useState, useMemo, useCallback, useRef, Suspense } from "react";
import { motion } from "framer-motion";
import { Search, Download } from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import {
    usePaginatedCustomers, useCustomerDashboardStats, toCustomerRpcArgs, mapCustomerRow,
    type PaginatedCustomerFilters, type PaginatedCustomer, parseCustomerSort,
} from "@/hooks/use-paginated-customers";
import { csvDate, csvPhone, downloadCsv, toCsv } from "@/lib/customer-csv";
import { toast } from "@/hooks/use-toast";
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
import { pct } from "@/lib/customer-format";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { usePermission } from "@/hooks/use-permission";
import { useCustomerTags } from "@/hooks/use-customer-management";
import { PERMISSIONS } from "@/lib/permissions";

const PAGE_LIMIT = 24;
const EXPORT_PAGE = 1000;

function CustomersPageContent() {
    const { t, language } = useLanguage();
    const { can } = usePermission();
    const canExport = can(PERMISSIONS.EXPORT_CUSTOMERS);
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const { state, rawSearch, setSearch, setSort, setView, setTag } = useCustomerUrlState();
    const { tags } = useCustomerTags();
    const { viewMode, setViewMode } = useCustomerStore();

    // Two independent server-side axes + the client-only action-lane cohorts.
    const [valueFilter, setValueFilter] = useState<ValueFilter>("all");
    const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
    const [laneFilter, setLaneFilter] = useState<LaneSegment | null>(null);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

    // Multi-select for bulk actions (WhatsApp, tag, export). The selected rows are
    // kept themselves, so the count, the campaign, the export and the tagging all
    // act on the same customers even after the filter changes.
    const [selected, setSelected] = useState<Map<string, PaginatedCustomer>>(new Map());
    const [showBroadcast, setShowBroadcast] = useState(false);
    const [showBulkTag, setShowBulkTag] = useState(false);
    const { bulkAddTags, isTagging } = useCustomerBulkActions();

    const filters = useMemo(() => {
        const f: PaginatedCustomerFilters = {
            search: state.search,
            city: state.city,
            tagId: state.tagId,
            sortBy: state.sortBy,
            sortOrder: state.sortOrder,
            valueFilter: valueFilter === "all" ? undefined : valueFilter,
            riskFilter: riskFilter === "all" ? undefined : riskFilter,
        };
        // Action-lane cohorts now filter server-side (exact across the whole cohort).
        if (laneFilter === "vipsQuiet") { f.valueFilter = "vip"; f.lastOrderBeforeDays = 30; }
        else if (laneFilter === "new") { f.firstOrderWithinDays = 30; }
        else if (laneFilter === "firstDelivery") { f.firstDeliveryPending = true; }
        return f;
    }, [state.search, state.city, state.tagId, state.sortBy, state.sortOrder, valueFilter, riskFilter, laneFilter]);

    const filtered = !!(state.search || state.city || state.tagId || filters.valueFilter || filters.riskFilter || laneFilter);

    const { data, isLoading, isError, refetch, isRefetching, isFetchingNextPage, fetchNextPage, hasNextPage } = usePaginatedCustomers(PAGE_LIMIT, filters);
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
        setAllSelectedFor(null);
        const row = allCustomers.find((c) => c.phone === phone);
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(phone)) next.delete(phone);
            else if (row) next.set(phone, row);
            return next;
        });
    }, [allCustomers]);
    const clearSelected = useCallback(() => {
        setSelected(new Map());
        setAllSelectedFor(null);
    }, []);
    const selectedPhones = useMemo(() => Array.from(selected.keys()), [selected]);
    const selectedSet = useMemo(() => new Set(selected.keys()), [selected]);
    const broadcastRecipients = useMemo(
        () => Array.from(selected.values())
            .map((c) => ({ phone: c.phone, name: c.has_name ? c.name : "", is_blacklisted: c.is_blacklisted })),
        [selected],
    );

    const customerCsvHeader = useCallback(() => [
        t("customers.export.name", "Name"), t("customers.export.phone", "Phone"),
        t("customers.export.governorate", "Governorate"), t("customers.export.orders", "Orders"),
        t("customers.export.completed", "Completed"), t("customers.export.spent", "Total spent"),
        t("customers.export.value", "Value"), t("customers.export.risk", "COD risk"),
        t("customers.export.lastOrder", "Last order"), t("customers.export.firstOrder", "First order"),
        t("customers.export.city", "City"), t("customers.export.secondaryPhone", "Secondary phone"),
        t("customers.export.blocked", "Blocked"),
    ], [t]);

    const customerCsvRow = useCallback((c: PaginatedCustomer) => [
        c.name, csvPhone(c.phone),
        c.governorate ? governorateLabel(c.governorate, language) || c.governorate : "",
        c.total_orders, c.completed_count, Math.round(c.total_spent),
        t(`customers.value.${c.value_tier}`, c.value_tier), t(`customers.risk.${c.risk_level}`, c.risk_level),
        csvDate(c.last_order_date), csvDate(c.first_order_date),
        c.city ?? "", c.secondary_phone ? csvPhone(c.secondary_phone) : "",
        c.is_blacklisted ? t("common.yes", "Yes") : t("common.no", "No"),
    ], [t, language]);

    const exportSelected = useCallback(() => {
        const rows = Array.from(selected.values());
        downloadCsv(
            toCsv([customerCsvHeader(), ...rows.map(customerCsvRow)]),
            `customers-selected-${new Date().toISOString().slice(0, 10)}.csv`,
        );
    }, [selected, customerCsvHeader, customerCsvRow]);

    const onConfirmTags = useCallback(async (tagIds: string[]): Promise<boolean> => {
        try {
            await bulkAddTags(selectedPhones, tagIds);
        } catch {
            toast({ variant: "error", title: t("customers.bulk.tagFailed") });
            return false;
        }
        toast({ variant: "success", title: t("customers.bulk.tagged", { count: String(selectedPhones.length) }) });
        setShowBulkTag(false);
        clearSelected();
        return true;
    }, [bulkAddTags, selectedPhones, clearSelected, t]);

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
        const sortBy = parseCustomerSort(s.sort?.by);
        if (s.sort && sortBy) setSort(sortBy, s.sort.order);
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

    // Every customer the current filters match, fetched in pages so the API row cap
    // never truncates it. Export and "select all" share it.
    const fetchAllMatching = useCallback(
        () => fetchAllPages<PaginatedCustomer>(async (offset) => {
            const { data, error } = await supabase.rpc("get_paginated_customers", toCustomerRpcArgs(filters, EXPORT_PAGE, offset));
            if (error) throw error;
            const page = data ?? [];
            // total_count rides on every row; the server caps the page size for users
            // without the export permission, so a short page is not proof of the last one.
            return { rows: page.map(mapCustomerRow), total: page.length > 0 ? Number(page[0].total_count) : 0 };
        }),
        [filters],
    );

    const [exporting, setExporting] = useState(false);
    const exportCsv = useCallback(async () => {
        setExporting(true);
        try {
            const rows = await fetchAllMatching();
            downloadCsv(
                toCsv([customerCsvHeader(), ...rows.map(customerCsvRow)]),
                `customers-${new Date().toISOString().slice(0, 10)}.csv`,
            );
        } catch {
            toast({ variant: "error", title: t("customers.export.failed") });
        } finally {
            setExporting(false);
        }
    }, [fetchAllMatching, customerCsvHeader, customerCsvRow, t]);

    const [selectingAll, setSelectingAll] = useState(false);
    // The filter whose every match is selected; null once the selection is edited.
    const [allSelectedFor, setAllSelectedFor] = useState<string | null>(null);
    const filtersKey = JSON.stringify(filters);
    const latestFiltersKey = useRef(filtersKey);
    latestFiltersKey.current = filtersKey;
    const selectAllMatching = useCallback(async () => {
        const startedFor = filtersKey;
        setSelectingAll(true);
        try {
            const rows = await fetchAllMatching();
            // The filters moved while fetching: these rows are for the old filter.
            if (latestFiltersKey.current !== startedFor) return;
            setAllSelectedFor(startedFor);
            setSelected((prev) => {
                const next = new Map(prev);
                for (const row of rows) next.set(row.phone, row);
                return next;
            });
        } catch {
            toast({ variant: "error", title: t("customers.bulk.selectAllFailed") });
        } finally {
            setSelectingAll(false);
        }
    }, [fetchAllMatching, filtersKey, t]);

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
                    {canExport && (
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <button
                                onClick={exportCsv}
                                disabled={totalCount === 0 || exporting}
                                className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl border border-(--card-border) bg-(--card-bg) text-sm font-semibold text-foreground hover:bg-muted/30 disabled:opacity-40 transition-colors"
                            >
                                <Download className="w-4 h-4" /> {t("customers.export")}
                            </button>
                        </div>
                    )}
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
                    onSort={(sb, so) => setSort(parseCustomerSort(sb) ?? "total_orders", so)}
                    tags={tags}
                    tagId={state.tagId ?? ""}
                    onTag={setTag}
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
                ) : isError ? (
                    <div className="bg-(--card-bg) rounded-3xl border border-(--card-border) p-12 text-center">
                        <p className="text-lg font-bold text-foreground mb-1">{t("customers.loadFailed")}</p>
                        <p className="text-sm text-muted-foreground mb-5">{t("customers.loadFailedHint")}</p>
                        <button
                            onClick={() => refetch()}
                            disabled={isRefetching}
                            className="h-11 px-6 rounded-2xl bg-foreground text-background text-sm font-semibold disabled:opacity-50"
                        >
                            {t("customers.profile.retry")}
                        </button>
                    </div>
                ) : displayed.length === 0 ? (
                    <div className="bg-(--card-bg) rounded-3xl border border-(--card-border) p-12 text-center">
                        <div className="mx-auto w-14 h-14 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
                            <Search className="w-6 h-6 text-muted-foreground" />
                        </div>
                        {filtered ? (
                            <>
                                <p className="text-lg font-bold text-foreground mb-1">{t("customers.noCustomers")}</p>
                                <p className="text-sm text-muted-foreground">{t("customers.adjustFilters")}</p>
                            </>
                        ) : (
                            <>
                                <p className="text-lg font-bold text-foreground mb-1">{t("customers.empty.title")}</p>
                                <p className="text-sm text-muted-foreground mb-5">{t("customers.empty.body")}</p>
                                <Link href="/orders" className="inline-flex items-center h-11 px-6 rounded-2xl bg-foreground text-background text-sm font-semibold">
                                    {t("customers.empty.cta")}
                                </Link>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {effectiveView === "list" ? (
                            <CustomerListTable customers={displayed} onRowClick={handleCustomerClick} selectedPhones={selectedSet} onToggleSelect={toggleSelect} />
                        ) : (
                            <CustomerGrid customers={displayed} onCustomerClick={handleCustomerClick} selectedPhones={selectedSet} onToggleSelect={toggleSelect} />
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
                totalMatching={totalCount}
                onSelectAll={selectAllMatching}
                allSelected={allSelectedFor === filtersKey}
                selectingAll={selectingAll}
                onExport={canExport ? exportSelected : undefined}
                onAddTag={canEdit ? () => setShowBulkTag(true) : undefined}
                onBroadcast={() => setShowBroadcast(true)}
                onClear={clearSelected}
            />
            <BroadcastModal
                isOpen={showBroadcast}
                onClose={() => setShowBroadcast(false)}
                recipients={broadcastRecipients}
                canCopyNumbers={canExport}
            />
            <BulkTagModal
                isOpen={showBulkTag}
                onClose={() => setShowBulkTag(false)}
                onConfirm={onConfirmTags}
                isLoading={isTagging}
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
