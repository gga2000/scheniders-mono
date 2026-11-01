"use client";

import Link from "next/link";
import { useState, useMemo, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Download, AlertTriangle } from "lucide-react";
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
import {
    CustomerSegmentTabs, activeSegment, type SegmentState, type LaneSegment, type ValueFilter, type RiskFilter,
} from "@/components/customers/list/customer-segment-tabs";
import { CustomerToolbar } from "@/components/customers/list/customer-toolbar";
import { CustomerGrid } from "@/components/customers/list/customer-grid";
import { CustomerListTable } from "@/components/customers/list/customer-list-table";
import { CustomerBulkBar } from "@/components/customers/list/customer-bulk-bar";
import { CustomerDetailDialog } from "@/components/customers/customer-detail-dialog";
import { BroadcastModal } from "@/components/customers/broadcast-modal";
import { BulkTagModal } from "@/components/customers/bulk-tag-modal";
import { useCustomerBulkActions } from "@/hooks/use-bulk-actions";
import { pct } from "@/lib/customer-format";
import { displayScore } from "@/lib/customer-reliability";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { usePermission } from "@/hooks/use-permission";
import { useCustomerTags } from "@/hooks/use-customer-management";
import { cn } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/permissions";

const PAGE_LIMIT = 24;
const EXPORT_PAGE = 1000;

function CustomersPageContent() {
    const { t, language } = useLanguage();
    const { can } = usePermission();
    const canExport = can(PERMISSIONS.EXPORT_CUSTOMERS);
    const canEdit = can(PERMISSIONS.EDIT_CUSTOMERS);
    const { state, chips, setChips, rawSearch, setSearch, setSort, setView, setTag } = useCustomerUrlState();
    const { tags } = useCustomerTags();
    const { viewMode, setViewMode, setLastListQuery, setProfileFromList } = useCustomerStore();
    // Back on the list: any "opened from the list" mark is spent.
    useEffect(() => { setProfileFromList(null); }, [setProfileFromList]);

    // Remember this list view so the profile's Back returns to the same filters.
    const listQuery = useSearchParams().toString();
    useEffect(() => { setLastListQuery(listQuery); }, [listQuery, setLastListQuery]);

    // Two independent server-side axes + the date/delivery cohorts of the saved views.
    // Kept in the URL, so opening a profile and coming back (or a reload) keeps them.
    // Dormant VIPs is a VIP-only cohort whatever a hand-edited URL says.
    const valueFilter: ValueFilter = chips.lane === "vipsQuiet" ? "vip" : chips.value;
    const riskFilter: RiskFilter = chips.risk;
    const laneFilter: LaneSegment | null = chips.lane;
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
            tagId: state.tagId,
            sortBy: state.sortBy,
            sortOrder: state.sortOrder,
            valueFilter: valueFilter === "all" ? undefined : valueFilter,
            riskFilter: riskFilter === "all" ? undefined : riskFilter,
        };
        // Cohort views filter server-side (exact across the whole cohort).
        if (laneFilter === "vipsQuiet") { f.valueFilter = "vip"; f.lastOrderBeforeDays = 30; }
        else if (laneFilter === "new") { f.firstOrderWithinDays = 30; }
        else if (laneFilter === "firstDelivery") { f.firstDeliveryPending = true; }
        return f;
    }, [state.search, state.tagId, state.sortBy, state.sortOrder, valueFilter, riskFilter, laneFilter]);

    const filtered = !!(state.search || state.tagId || filters.valueFilter || filters.riskFilter || laneFilter);

    const { data, isLoading, isError, isFetchNextPageError, isRefetchError, refetch, isRefetching, isFetchingNextPage, fetchNextPage, hasNextPage } = usePaginatedCustomers(PAGE_LIMIT, filters);
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

    // Dormant VIPs loads oldest-first; leaving it restores the default order.
    // A sort the merchant picked outside that cohort is left alone.
    const exitSort: { by: string; order: "asc" | "desc" } | undefined =
        laneFilter === "vipsQuiet" && state.sortBy === "last_order_date" && state.sortOrder === "asc"
            ? { by: "total_orders", order: "desc" }
            : undefined;

    const onSegmentSelect = (s: SegmentState) => {
        const sortBy = parseCustomerSort(s.sort?.by);
        setChips(
            { value: s.value, risk: s.risk, lane: s.lane },
            s.sort && sortBy
                ? { by: sortBy, order: s.sort.order }
                : exitSort,
        );
    };

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

    // One line of store-wide figures that no saved view already counts.
    const subtitle = filtered
        ? t("customers.subtitleFiltered", {
            shown: totalCount.toLocaleString("en-US"),
            total: (stats?.total_customers ?? totalCount).toLocaleString("en-US"),
        })
        : stats
            ? t("customers.subtitle", {
                repeat: String(pct(stats.repeat_customer_count, stats.total_customers)),
                score: String(displayScore(stats.avg_trust_score)),
                gov: stats.top_governorate ? governorateLabel(stats.top_governorate, language) || stats.top_governorate : "—",
                pct: String(pct(stats.top_governorate_count, stats.total_customers)),
            })
            : "";

    return (
        <div className={cn("customers-page min-h-screen px-6 md:px-8 pt-4 pb-8 bg-background", selected.size > 0 && "pb-28")}>
            <div className="max-w-[1920px] mx-auto space-y-3">
                {/* Header: title, the store-wide figures, export */}
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center justify-between gap-4"
                >
                    <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap min-w-0">
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("customers.title")}</h1>
                        {subtitle && <p dir="auto" className="text-muted-foreground text-sm tabular-nums">{subtitle}</p>}
                    </div>
                    {canExport && (
                        <button
                            onClick={exportCsv}
                            disabled={totalCount === 0 || exporting}
                            className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-(--card-border) bg-(--card-bg) text-sm font-semibold text-foreground hover:bg-muted/30 disabled:opacity-40 transition-colors"
                        >
                            <Download className="w-4 h-4" /> {t("customers.export")}
                        </button>
                    )}
                </motion.div>

                {/* Saved views: the one place each count is shown */}
                {stats && (
                    <CustomerSegmentTabs
                        stats={stats}
                        active={activeSegment({ value: valueFilter, risk: riskFilter, lane: laneFilter })}
                        onSelect={onSegmentSelect}
                    />
                )}

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
                />

                {/* A failed background refresh keeps whatever is on screen. */}
                {isRefetchError && (
                    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                        <span>{t("customers.refreshFailed", "Couldn't refresh. Showing the last loaded list.")}</span>
                        <button
                            onClick={() => refetch()}
                            disabled={isRefetching}
                            className="h-9 px-4 rounded-xl border border-current text-sm font-semibold disabled:opacity-50"
                        >
                            {t("customers.profile.retry")}
                        </button>
                    </div>
                )}
                {/* Content */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="bg-(--card-bg) rounded-2xl border border-(--card-border) p-4 h-44 animate-pulse" />
                        ))}
                    </div>
                ) : isError && !data ? (
                    <div role="alert" className="bg-(--card-bg) rounded-3xl border border-(--card-border) p-12 text-center">
                        <div className="mx-auto w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-500/15 flex items-center justify-center mb-4">
                            <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-300" />
                        </div>
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
                                <p className="text-lg font-bold text-foreground mb-1">
                                    {state.search
                                        ? <>{t("customers.noMatchFor")} <bdi className="font-mono px-2 py-0.5 rounded-lg bg-foreground/5">{state.search}</bdi></>
                                        : t("customers.noCustomers")}
                                </p>
                                <p className="text-sm text-muted-foreground">{t("customers.adjustFilters")}</p>
                                {state.search && (
                                    <button
                                        onClick={() => setSearch("")}
                                        className="mt-5 h-11 px-6 rounded-2xl border border-(--card-border) bg-(--card-bg) text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
                                    >
                                        {t("customers.search.clear")}
                                    </button>
                                )}
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
                            <div className="flex flex-col items-center gap-2 pt-2">
                                {isFetchNextPageError && (
                                    <p role="alert" className="text-sm text-rose-600">{t("customers.loadMoreFailed", "Couldn't load more customers. Try again.")}</p>
                                )}
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
