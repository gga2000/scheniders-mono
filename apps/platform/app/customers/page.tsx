"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Upload, Download, Plus, Users, Trophy, X, SlidersHorizontal, LayoutGrid, List } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
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

    // Sticky compact filter bar — show when user scrolls past the main filter card
    const filterCardRef = useRef<HTMLDivElement>(null);
    const [showStickyBar, setShowStickyBar] = useState(false);
    useEffect(() => {
        const el = filterCardRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => {
            setShowStickyBar(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        }, { threshold: 0, rootMargin: "-60px 0px 0px 0px" });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    // Active-filter breadcrumbs — dismissible chips for each non-default filter
    const activeFilters = useMemo(() => {
        const items: { key: string; label: string; onRemove: () => void }[] = [];
        if (state.search) {
            items.push({
                key: "search",
                label: `"${state.search}"`,
                onRemove: () => setSearch(""),
            });
        }
        if (state.trustTier && state.trustTier !== "all") {
            items.push({
                key: "tier",
                label: t(`customers.tier.${state.trustTier}`),
                onRemove: () => setTrustTier(undefined),
            });
        }
        if (state.city) {
            items.push({
                key: "city",
                label: state.city,
                onRemove: () => setCity(""),
            });
        }
        if (timePeriod !== "all") {
            const periodLabels: Record<string, string> = {
                today: "Today",
                week: "This Week",
                month: "This Month",
            };
            items.push({
                key: "time",
                label: periodLabels[timePeriod],
                onRemove: () => setTimePeriod("all"),
            });
        }
        return items;
    }, [state.search, state.trustTier, state.city, timePeriod, setSearch, setTrustTier, setCity, t]);

    const clearAllFilters = useCallback(() => {
        setSearch("");
        setTrustTier(undefined);
        setCity("");
        setTimePeriod("all");
        setSort("last_order_date", "desc");
    }, [setSearch, setTrustTier, setCity, setSort]);

    const hasFiltersActive = activeFilters.length > 0;
    const filteredCount = isLoading ? 0 : allCustomers.length;

    return (
        <div className="customers-page min-h-screen p-6 md:p-8 lg:p-10">
            {/* Compact Header: Title + Count Pills + Actions */}
            <motion.header
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex justify-between items-center gap-4 flex-wrap mb-6"
            >
                <div className="flex items-center gap-4 flex-wrap">
                    <h2 className="text-xl font-bold text-foreground tracking-tight font-headline">
                        {t("customers.title")}
                    </h2>

                    {/* Total Customers pill */}
                    <div className="flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                        <div className="p-1.5 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-amber-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                            <Users className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-black text-foreground dark:text-white leading-none tabular-nums">
                                {totalCount.toLocaleString("en-US")}
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                {t("customers.title")}
                            </span>
                        </div>
                    </div>

                    {/* VIP pill */}
                    {stats && (
                        <div className="flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                            <div className="p-1.5 rounded-full bg-gradient-to-tr from-violet-400 to-purple-600 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-violet-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                <Trophy className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-lg font-black text-foreground dark:text-white leading-none tabular-nums">
                                    {(stats.platinum_count + stats.gold_count).toLocaleString("en-US")}
                                </span>
                                <span className="text-[10px] font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">
                                    VIP
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <button className="p-2.5 rounded-[2rem] border border-(--card-border) hover:bg-muted/30 transition-all text-foreground">
                        <Upload className="w-4 h-4" />
                    </button>
                    <button className="p-2.5 rounded-[2rem] border border-(--card-border) hover:bg-muted/30 transition-all text-foreground">
                        <Download className="w-4 h-4" />
                    </button>
                    <button className="bg-foreground text-background px-5 py-2.5 rounded-[2rem] font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2 active:scale-95">
                        <Plus className="w-4 h-4" />
                        {t("customers.addCustomer")}
                    </button>
                </div>
            </motion.header>

            {/* KPI Cards — first major block */}
            {stats && (
                <div className="mb-6">
                    <TrustTierStats stats={stats} />
                </div>
            )}

            {/* Health Alerts */}
            {allCustomers.length > 0 && (
                <CustomerHealthAlerts
                    customers={allCustomers}
                    onViewCustomer={handleCustomerClick}
                />
            )}

            {/* Unified Filter Card — radial-gradient depth + overflow-hidden for inner effects */}
            <motion.div
                ref={filterCardRef}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="relative overflow-hidden bg-(--card-bg) rounded-[3rem] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] border border-(--card-border) mb-8 space-y-5"
            >
                {/* Depth: faint warm radial glow top-left */}
                <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none opacity-60"
                    style={{
                        background:
                            "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(251,227,142,0.08), transparent 60%)",
                    }}
                />

                {/* Row 1: Search (with live count + clear) + Time Period */}
                <div className="relative flex items-center gap-4 flex-wrap">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={rawSearch}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t("customers.search")}
                            className="w-full bg-background border-none rounded-[2rem] pl-11 pr-40 py-3 focus:ring-2 focus:ring-foreground/10 transition-all text-sm placeholder:text-muted-foreground"
                        />
                        {/* Right-edge slot: live count + clear */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                            <div className="px-2.5 py-1 rounded-full bg-foreground/5 text-[11px] font-semibold text-muted-foreground">
                                <AnimatedCounter value={filteredCount} /> / {totalCount.toLocaleString("en-US")}
                            </div>
                            {rawSearch && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.6 }}
                                    onClick={() => setSearch("")}
                                    className="p-1 rounded-full hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label="Clear search"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </motion.button>
                            )}
                        </div>
                    </div>
                    <TimePeriodFilter value={timePeriod} onChange={setTimePeriod} />
                </div>

                {/* Row 2: Tier filter chips */}
                <div className="relative">
                    <TrustFilterChips
                        activeTier={state.trustTier as TrustTier | "all" | undefined}
                        onTierChange={setTrustTier}
                        tierCounts={tierCounts}
                    />
                </div>

                {/* Gradient-fade divider */}
                <div
                    aria-hidden
                    className="relative h-px"
                    style={{
                        background:
                            "linear-gradient(to right, transparent, var(--card-border, rgba(0,0,0,0.08)), transparent)",
                    }}
                />

                {/* Row 3: Sort/City/Total Value + View Toggle */}
                <div className="relative">
                    <SecondaryFilterBar
                        sortBy={state.sortBy || "last_order_date"}
                        sortOrder={state.sortOrder || "desc"}
                        onSortChange={(sb, so) => setSort(sb as any, so)}
                        viewMode={effectiveViewMode}
                        onViewModeChange={(mode) => { setViewMode(mode); setView(mode); }}
                        city={state.city || ""}
                        onCityChange={setCity}
                    />
                </div>
            </motion.div>

            {/* Active Filter Breadcrumbs — dismissible chips when any filter is applied */}
            <AnimatePresence>
                {hasFiltersActive && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Active filters
                            </span>
                            {activeFilters.map((f) => (
                                <motion.button
                                    key={f.key}
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    whileHover={{ y: -1 }}
                                    onClick={f.onRemove}
                                    className="h-8 pl-3 pr-2 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-(--card-border) text-sm font-semibold text-foreground flex items-center gap-1.5 transition-colors"
                                >
                                    <span>{f.label}</span>
                                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                                </motion.button>
                            ))}
                            <button
                                onClick={clearAllFilters}
                                className="h-8 px-3 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                            >
                                Clear all
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Sticky compact filter bar — fades in when user scrolls past the main filter card */}
            <AnimatePresence>
                {showStickyBar && (
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="fixed top-4 left-24 right-6 md:left-28 md:right-8 z-40"
                    >
                        <div className="flex items-center gap-3 bg-(--card-bg) backdrop-blur-xl rounded-full pl-4 pr-2 py-2 border border-(--card-border) shadow-[0_8px_32px_-8px_rgba(0,0,0,0.18)]">
                            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                            <input
                                type="text"
                                value={rawSearch}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t("customers.search")}
                                className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
                            />
                            <div className="px-2.5 py-1 rounded-full bg-foreground/5 text-[11px] font-semibold text-muted-foreground shrink-0">
                                <AnimatedCounter value={filteredCount} />
                            </div>
                            {hasFiltersActive && (
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-foreground text-background text-[11px] font-bold shrink-0">
                                    <SlidersHorizontal className="w-3 h-3" />
                                    {activeFilters.length}
                                </div>
                            )}
                            <div className="w-px h-6 bg-(--card-border) mx-1" />
                            {/* Mini view toggle */}
                            <div className="relative flex bg-background rounded-full p-0.5 border border-(--card-border) h-8">
                                {(["grid", "list"] as const).map((mode) => {
                                    const isActive = effectiveViewMode === mode;
                                    const Icon = mode === "grid" ? LayoutGrid : List;
                                    return (
                                        <motion.button
                                            key={mode}
                                            onClick={() => { setViewMode(mode); setView(mode); }}
                                            whileTap={{ scale: 0.94 }}
                                            className="relative px-2.5 rounded-full flex items-center justify-center"
                                        >
                                            {isActive && (
                                                <motion.div
                                                    layoutId="sticky-view-thumb"
                                                    className="absolute inset-0 rounded-full bg-foreground"
                                                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                                                />
                                            )}
                                            <Icon className={`relative w-3.5 h-3.5 ${isActive ? "text-background" : "text-muted-foreground"}`} />
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7">
                    {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="bg-(--card-bg) rounded-[3rem] border border-(--card-border) p-6 h-52 animate-pulse" />
                    ))}
                </div>
            ) : allCustomers.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="bg-(--card-bg) rounded-[3rem] border border-(--card-border) p-12 text-center"
                >
                    <div className="mx-auto w-14 h-14 rounded-full bg-foreground/5 flex items-center justify-center mb-4">
                        <Search className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold text-foreground mb-1">
                        {t("customers.noCustomers")}
                    </p>
                    <p className="text-sm text-muted-foreground mb-5">
                        {hasFiltersActive
                            ? `No customers match your ${activeFilters.length} active ${activeFilters.length === 1 ? "filter" : "filters"}. Try removing one below.`
                            : t("customers.adjustFilters")}
                    </p>
                    {hasFiltersActive && (
                        <button
                            onClick={clearAllFilters}
                            className="bg-foreground text-background px-5 py-2.5 rounded-full font-bold text-sm hover:opacity-90 transition-all active:scale-95"
                        >
                            Clear all filters
                        </button>
                    )}
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
