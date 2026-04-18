"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Upload, Download, Plus, Users, Trophy } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePaginatedCustomers, useCustomerDashboardStats } from "@/hooks/use-paginated-customers";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { useCustomerStore } from "@/store/use-customer-store";
import { TrustTierStats } from "@/components/customers/list/trust-tier-stats";
import { TrustFilterChips } from "@/components/customers/list/trust-filter-chips";
import { SecondaryFilterBar } from "@/components/customers/list/secondary-filter-bar";
import { CustomerGrid } from "@/components/customers/list/customer-grid";
import { PaginationFooter } from "@/components/customers/list/pagination-footer";
import { CustomerHealthAlerts } from "@/components/customers/customer-health-alerts";
import { TimePeriodFilter, TimePeriod } from "@/components/products/time-period-filter";
import type { TrustTier } from "@/types/customer";

const PAGE_SIZE = 21; // 7 rows x 3 cols

function CustomersPageContent() {
    const { t } = useLanguage();
    const router = useRouter();
    const {
        state,
        rawSearch,
        setSearch,
        setCity,
        setSort,
        setTrustTier,
        setView,
    } = useCustomerUrlState();

    const { viewMode, setViewMode } = useCustomerStore();
    const [page, setPage] = useState(1);
    const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");

    const filters = useMemo(() => ({
        search: state.search,
        status: state.status,
        city: state.city,
        sortBy: state.sortBy as any,
        sortOrder: state.sortOrder,
        minLtv: state.minLtv,
        maxLtv: state.maxLtv,
        lastOrderWithinDays: state.lastOrderWithinDays,
        tagId: state.tagId,
        trustTier: state.trustTier as TrustTier | "all" | undefined,
        minTrustScore: state.minTrustScore,
        maxTrustScore: state.maxTrustScore,
    }), [state]);

    const {
        data,
        isLoading,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
    } = usePaginatedCustomers(PAGE_SIZE, filters);

    const { data: stats } = useCustomerDashboardStats();

    const allCustomers = useMemo(() => {
        return data?.pages.flatMap((p) => p.customers) || [];
    }, [data]);

    const totalCount = data?.pages[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    // For pagination, we show the current "page" of customers
    const pageCustomers = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return allCustomers.slice(start, start + PAGE_SIZE);
    }, [allCustomers, page]);

    // Fetch more pages if needed
    const handlePageChange = useCallback((newPage: number) => {
        setPage(newPage);
        const neededItems = newPage * PAGE_SIZE;
        if (neededItems > allCustomers.length && hasNextPage) {
            fetchNextPage();
        }
    }, [allCustomers.length, hasNextPage, fetchNextPage]);

    const handleCustomerClick = useCallback((phone: string) => {
        router.push(`/customers/${encodeURIComponent(phone)}`);
    }, [router]);

    const tierCounts = stats ? {
        platinum: stats.platinum_count,
        gold: stats.gold_count,
        silver: stats.silver_count,
        bronze: stats.bronze_count,
        new: stats.new_tier_count,
        watch: stats.watch_count,
        risky: stats.risky_count,
        blocked: stats.blocked_count,
    } : undefined;

    const effectiveViewMode = state.view || viewMode;

    return (
        <div className="customers-page min-h-screen p-6 md:p-8 lg:p-10">
            {/* Header */}
            <motion.header
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="bg-(--card-bg) rounded-[3rem] p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] border border-(--card-border) mb-8"
            >
                {/* Top: Title + Pills + Actions */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-5 flex-wrap">
                        <h2 className="text-[28px] font-bold text-foreground tracking-tight font-headline">
                            {t("customers.title")}
                        </h2>

                        {/* Total Customers pill */}
                        <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                            <div className="p-2 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-amber-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                <Users className="w-4 h-4" />
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-black text-foreground dark:text-white leading-none tabular-nums">
                                    {totalCount.toLocaleString("en-US")}
                                </span>
                                <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                    {t("customers.title")}
                                </span>
                            </div>
                        </div>

                        {/* VIP pill */}
                        {stats && (
                            <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                                <div className="p-2 rounded-full bg-gradient-to-tr from-violet-400 to-purple-600 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-violet-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                    <Trophy className="w-4 h-4" />
                                </div>
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-2xl font-black text-foreground dark:text-white leading-none tabular-nums">
                                        {(stats.platinum_count + stats.gold_count).toLocaleString("en-US")}
                                    </span>
                                    <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                        VIP
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button className="p-3 rounded-[2rem] border border-(--card-border) hover:bg-muted/30 transition-all text-foreground">
                            <Upload className="w-5 h-5" />
                        </button>
                        <button className="p-3 rounded-[2rem] border border-(--card-border) hover:bg-muted/30 transition-all text-foreground">
                            <Download className="w-5 h-5" />
                        </button>
                        <button className="bg-foreground text-background px-6 py-3 rounded-[2rem] font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2 active:scale-95">
                            <Plus className="w-4 h-4" />
                            {t("customers.addCustomer")}
                        </button>
                    </div>
                </div>

                {/* Bottom: Search + Time Period */}
                <div className="flex items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={rawSearch}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t("customers.search")}
                            className="w-full bg-background border-none rounded-[2rem] pl-11 pr-4 py-3 focus:ring-2 focus:ring-foreground/10 transition-all text-sm placeholder:text-muted-foreground"
                        />
                    </div>
                    <TimePeriodFilter value={timePeriod} onChange={setTimePeriod} />
                </div>
            </motion.header>

            {/* Tier Stats */}
            {stats && <TrustTierStats stats={stats} />}

            {/* Health Alerts */}
            {allCustomers.length > 0 && (
                <CustomerHealthAlerts
                    customers={allCustomers}
                    onViewCustomer={handleCustomerClick}
                />
            )}

            {/* Filter Chips */}
            <TrustFilterChips
                activeTier={state.trustTier as TrustTier | "all" | undefined}
                onTierChange={setTrustTier}
                tierCounts={tierCounts}
            />

            {/* Secondary Filter Bar */}
            <SecondaryFilterBar
                sortBy={state.sortBy || "last_order_date"}
                sortOrder={state.sortOrder || "desc"}
                onSortChange={(sb, so) => setSort(sb as any, so)}
                viewMode={effectiveViewMode}
                onViewModeChange={(mode) => { setViewMode(mode); setView(mode); }}
                city={state.city || ""}
                onCityChange={setCity}
            />

            {/* Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">
                    {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="bg-(--card-bg) rounded-[3rem] border border-(--card-border) p-6 h-52 animate-pulse" />
                    ))}
                </div>
            ) : allCustomers.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-20"
                >
                    <p className="text-lg text-muted-foreground">{t("customers.noCustomers")}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("customers.adjustFilters")}</p>
                </motion.div>
            ) : (
                <>
                    <CustomerGrid
                        customers={pageCustomers.length > 0 ? pageCustomers : allCustomers.slice(0, PAGE_SIZE)}
                        onCustomerClick={handleCustomerClick}
                    />
                    <PaginationFooter
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        totalCount={totalCount}
                    />
                </>
            )}
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
