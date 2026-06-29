"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { motion } from "framer-motion";
import { Search, Upload, Download, Plus } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePaginatedCustomers, useCustomerDashboardStats } from "@/hooks/use-paginated-customers";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { useCustomerStore } from "@/store/use-customer-store";
import { CustomerInsightStrip } from "@/components/customers/list/customer-insight-strip";
import { CustomerActionLane, type LaneSegment } from "@/components/customers/list/customer-action-lane";
import { CustomerToolbar } from "@/components/customers/list/customer-toolbar";
import { ReliabilityChips, reliabilityCounts, type ReliabilityFilter } from "@/components/customers/list/reliability-chips";
import { CustomerGrid } from "@/components/customers/list/customer-grid";
import { CustomerListTable } from "@/components/customers/list/customer-list-table";
import { CustomerDetailDialog } from "@/components/customers/customer-detail-dialog";
import { reliabilityForCustomer, daysSince, firstDeliveryPending } from "@/lib/customer-reliability";
import { pct } from "@/lib/customer-format";

const PAGE_LIMIT = 24;

function CustomersPageContent() {
    const { t } = useLanguage();
    const { state, rawSearch, setSearch, setSort, setView } = useCustomerUrlState();
    const { viewMode, setViewMode } = useCustomerStore();

    // Client-side cross-cut filters (reliability chips + action lane).
    const [reliabilityFilter, setReliabilityFilter] = useState<ReliabilityFilter>("all");
    const [laneFilter, setLaneFilter] = useState<LaneSegment | null>(null);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

    const filters = useMemo(() => ({
        search: state.search,
        city: state.city,
        sortBy: state.sortBy as any,
        sortOrder: state.sortOrder,
        reliabilityFilter: reliabilityFilter === "all" ? undefined : reliabilityFilter,
    }), [state.search, state.city, state.sortBy, state.sortOrder, reliabilityFilter]);

    const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = usePaginatedCustomers(PAGE_LIMIT, filters);
    const { data: stats } = useCustomerDashboardStats();

    const allCustomers = useMemo(() => data?.pages.flatMap((p) => p.customers) || [], [data]);
    const totalCount = data?.pages[0]?.totalCount || 0;
    const effectiveView = state.view || viewMode;

    // The value/reliability chip filters server-side (via `filters`); the action-lane
    // cohorts that aren't a simple tier filter over the loaded set here.
    const displayed = useMemo(() => {
        if (!laneFilter) return allCustomers;
        return allCustomers.filter((c) => {
            switch (laneFilter) {
                case "vipsQuiet":
                    return (c.trust_tier === "platinum" || c.trust_tier === "gold") && (daysSince(c.last_order_date) ?? 0) > 30;
                case "new":
                    return (daysSince(c.first_order_date) ?? 999) <= 30;
                case "firstDelivery":
                    return firstDeliveryPending(c);
                default:
                    return true;
            }
        });
    }, [allCustomers, laneFilter]);

    const selectedCustomer = useMemo(
        () => allCustomers.find((c) => c.phone === selectedPhone) ?? null,
        [allCustomers, selectedPhone],
    );

    const handleCustomerClick = useCallback((phone: string) => {
        setSelectedPhone(phone);
    }, []);

    const onReliability = useCallback((next: ReliabilityFilter) => {
        setReliabilityFilter(next);
        setLaneFilter(null);
    }, []);

    const onSegment = useCallback((kind: LaneSegment) => {
        // "Risky" maps to the server-side value filter so the whole risky cohort loads.
        if (kind === "risky") {
            setReliabilityFilter((prev) => (prev === "risky" ? "all" : "risky"));
            setLaneFilter(null);
            return;
        }
        setLaneFilter((prev) => (prev === kind ? null : kind));
        setReliabilityFilter("all");
    }, []);

    const exportCsv = useCallback(() => {
        const rows = [
            ["الاسم", "الهاتف", "المدينة", "الطلبات", "الإنفاق", "آخر طلب", "أول طلب", "الموثوقية"],
            ...displayed.map((c) => [
                c.name, c.phone, c.governorate || c.city || "",
                String(c.total_orders ?? 0), String(c.total_spent ?? 0),
                c.last_order_date || "", c.first_order_date || "",
                reliabilityForCustomer(c),
            ]),
        ];
        const csv = rows.map((r) => r.map((cell) => {
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
    }, [displayed]);

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
                            disabled={displayed.length === 0}
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
                {stats && <CustomerActionLane stats={stats} activeSegment={laneFilter ?? (reliabilityFilter === "risky" ? "risky" : null)} onSegment={onSegment} />}

                {/* Toolbar + reliability chips */}
                <CustomerToolbar
                    search={rawSearch}
                    onSearch={setSearch}
                    sortBy={state.sortBy || "total_orders"}
                    sortOrder={state.sortOrder || "desc"}
                    onSort={(sb, so) => setSort(sb as any, so)}
                    view={effectiveView}
                    onView={(mode) => { setViewMode(mode); setView(mode); }}
                >
                    <ReliabilityChips
                        active={reliabilityFilter}
                        counts={stats ? reliabilityCounts(stats) : {}}
                        total={stats?.total_customers ?? totalCount}
                        onChange={onReliability}
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
                            <CustomerListTable customers={displayed} onRowClick={handleCustomerClick} />
                        ) : (
                            <CustomerGrid customers={displayed} onCustomerClick={handleCustomerClick} />
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
