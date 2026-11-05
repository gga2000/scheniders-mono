"use client";

import { ordersDateLabel } from "@/lib/orders-date-label";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useOrderStore } from "@/store/use-order-store";
import { StockPinChips } from "@/components/orders/stock-pin-chips";
import { Order } from "@/lib/supabase";
import { CollapsedToolbar } from "@/components/orders/toolbar/collapsed-toolbar";
import { OrdersAnalyticsPanel } from "@/components/orders/orders-analytics-panel";
import { OrdersFilterBar } from "@/components/orders/orders-filter-bar";
import { EASE_CHROME, EASE_PANEL } from "@/components/layout/page-transition";
import { OrderPipeline } from "@/components/orders/order-pipeline";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Download, Package, CheckSquare, MapPin, CalendarDays, BarChart3, Trash2, LayoutGrid, Table, Bell, BellOff, List, GitBranch, SlidersHorizontal, LayoutList, Rows3, Archive, RotateCcw, Minimize2, Truck, PackageX, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdsTodayChips } from "@/components/ads/ads-today-chips";
import { AdsChipsToggle } from "@/components/ads/ads-chips-toggle";
import { PrimeTrackToggle } from "@/components/orders/prime-track-toggle";
import { ShieldDangerToggle } from "@/components/orders/shield/shield-danger-toggle";
import { ShieldDangerPanel } from "@/components/orders/shield/shield-danger-panel";
import { notificationService } from "@/lib/notification-service";
import { toast } from "@/hooks/use-toast";
import { DateRangePicker, SavedViewsTabs, StickyFilterBar } from "@/components/orders/page/lazy";
import type { OrdersPageModel } from "./use-orders-page-model";

/** One section of the orders page; see app/orders/page.tsx. */
export function OrdersPageToolbar({ m }: { m: OrdersPageModel }) {
    const { sidebarExpanded, setIsReturnsOpen, setIsStockTodayOpen, setIsScannerOpen, showSubFilters, toggleSubFilters, showAdChannels, toggleAdChannels, showAdsChips, toggleAdsChips, showPipeline, togglePipeline, filters, setFilters, clearFilters, filterPresets, saveFilterPreset, loadFilterPreset, deleteFilterPreset, archivedOrders, fetchArchivedOrders, undoLastAction, canUndo, statusCounts, attentionCounts, oversoldCount, isMobile, t, datePreset, viewMode, setViewMode, compactView, setCompactView, compactGrid, setCompactGrid, showSearchBar, setShowSearchBar, analyticsLevel, setAnalyticsLevel, toolbarCollapsed, toggleToolbarCollapse, setSoundEnabled, showFilters, setShowFilters, groupBy, setGroupBy, filterDuplicatesOnly, setFilterDuplicatesOnly, filterDueToday, setFilterDueToday, activePresetId, setActivePresetId, setIsCreateModalOpen, setIsExportModalOpen, showDatePicker, setShowDatePicker, datePickerPos, selectedOrders, showArchived, setShowArchived, isHeaderAnimating, setIsHeaderAnimating, notificationsEnabled, setNotificationsEnabled, dateButtonRef, datePickerRef, toolbarScrollRef, toolbarFade, filteredOrders, flaggedCount, dueTodayCount, totalRiskCount, countVis, previewing, listCountShown, openScanner, openReturns, openCreateModal, selectAll, isBulkProcessing, setShipConfirmCompany, setShipConfirmOpen, setShipConfirmKey, guardedBulkActions, showMapPanel, setShowMapPanel, hasActiveFilters, dangerBandCounts, dangerListTotal } = m;
    const showDangerPanel = useOrderStore((s) => s.showDangerPanel);
    const setShowDangerPanel = useOrderStore((s) => s.setShowDangerPanel);
    const dangerBand = useOrderStore((s) => s.dangerBand);
    const setDangerBand = useOrderStore((s) => s.setDangerBand);
    return (
        <>
            {/* Section 1: Toolbar — stagger child */}
            <motion.div
                variants={{
                    hidden: { opacity: 0, y: 6 },
                    visible: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.35, ease: EASE_CHROME },
                    },
                }}
            >

                {/* Collapsed Toolbar Bar - Minimal floating header when collapsed */}
                <CollapsedToolbar
                    open={toolbarCollapsed}
                    allSelected={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                    selectedCount={selectedOrders.size}
                    count={listCountShown ? filteredOrders.length : null}
                    status={filters.status}
                    previewing={previewing}
                    onSelectAll={selectAll}
                    setFilters={setFilters}
                    onScannerOpen={openScanner}
                    onReturnsOpen={openReturns}
                    onCreateOpen={openCreateModal}
                    onExpand={toggleToolbarCollapse}
                />

                {/* Full Header - Hidden when collapsed */}
                <AnimatePresence initial={false}>
                    {!toolbarCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: EASE_PANEL }}
                            onAnimationStart={() => setIsHeaderAnimating(true)}
                            onAnimationComplete={() => setIsHeaderAnimating(false)}
                            className={cn(
                                isHeaderAnimating ? "overflow-hidden" : "overflow-visible"
                            )}
                        >
                            {/* Page Header - Premium State-of-the-Art Design */}
                            <motion.div
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, ease: EASE_CHROME }}
                                className="space-y-3"
                            >
                                {/* Title Row - Premium */}
                                <div className="flex items-center justify-between pb-2">
                                    <div className="flex items-center gap-4">
                                        {/* Select All - Custom Glass Checkbox */}
                                        <button
                                            onClick={selectAll}
                                            disabled={previewing}
                                            className={cn(
                                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 group relative overflow-hidden",
                                                selectedOrders.size === filteredOrders.length && filteredOrders.length > 0
                                                    ? "border-transparent text-white"
                                                    : "border-muted-foreground/30 hover:border-primary/50"
                                            )}
                                            title={t("orders.tip.selectAll")}
                                        >
                                            {selectedOrders.size === filteredOrders.length && filteredOrders.length > 0 && (
                                                <div className="absolute inset-0 bg-gradient-to-br from-primary to-violet-600 opacity-100" />
                                            )}
                                            <CheckSquare className={cn("w-3.5 h-3.5 z-10 transition-transform duration-300", selectedOrders.size > 0 ? "scale-100" : "scale-0")} />
                                        </button>

                                        {/* Order Count - Glass Pill */}
                                        <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] orders-toolbar-pill">
                                            <div className="p-2 rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 dark:!bg-none dark:bg-[var(--primary)] text-white dark:text-black shadow-lg shadow-amber-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
                                                <Package className="w-4 h-4" />
                                            </div>
                                            <div className="flex flex-col leading-none">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-2xl font-black text-foreground dark:text-white" data-orders-header-count>
                                                        {listCountShown ? filteredOrders.length : "—"}
                                                    </span>
                                                    <span className="text-xs font-semibold text-muted-foreground dark:text-[var(--foreground-muted)] uppercase tracking-wide">{t("orders.title")}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stock today - sits beside the count so stock is one glance from the orders */}
                                        <button
                                            type="button"
                                            onClick={() => setIsStockTodayOpen(true)}
                                            className="flex items-center gap-2 pl-2 pr-4 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] orders-toolbar-pill hover:-translate-y-0.5 hover:shadow-md transition-all duration-300"
                                            title={t("orders.stockToday.title", "Stock today")}
                                            aria-label={oversoldCount > 0
                                                ? t("orders.stockToday.buttonOversold", "Stock today, {count} oversold", { count: oversoldCount })
                                                : t("orders.stockToday.title", "Stock today")}
                                        >
                                            <span className="p-2 rounded-full bg-gradient-to-tr from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
                                                <Boxes className="w-4 h-4" />
                                            </span>
                                            <span className="text-sm font-bold text-foreground whitespace-nowrap">{t("orders.stockToday.button", "Stock")}</span>
                                            {oversoldCount > 0 && (
                                                <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white tabular-nums">
                                                    {oversoldCount}
                                                </span>
                                            )}
                                        </button>

                                        <StockPinChips onOpen={() => setIsStockTodayOpen(true)} />

                                        {/* Selection Indicator */}
                                        <AnimatePresence>
                                            {selectedOrders.size > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                                    exit={{ opacity: 0, scale: 0.8, x: -20 }}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/25"
                                                >
                                                    <span className="text-sm font-bold">{selectedOrders.size}</span>
                                                    <span className="text-xs font-medium opacity-80">{t("orders.selected")}</span>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {showAdsChips ? <AdsTodayChips /> : null}
                                </div>

                                {/* Row 2: Control Groups - Premium Glass Cards.
                                    One flex container so justify-between spreads free space
                                    evenly between ALL cards. Never position:sticky a card in
                                    here — it paints over the cards scrolling beneath it; the
                                    edge fades below signal overflow instead. */}
                                    <div
                                        ref={toolbarScrollRef}
                                        className={cn(
                                            "flex items-start justify-between gap-3 pt-2 pb-6 w-full md:mx-0 md:px-0 overflow-x-auto scrollbar-hide flex-nowrap",
                                            toolbarFade.left && toolbarFade.right && "[mask-image:linear-gradient(to_right,transparent,black_32px,black_calc(100%-32px),transparent)]",
                                            toolbarFade.left && !toolbarFade.right && "[mask-image:linear-gradient(to_right,transparent,black_32px)]",
                                            !toolbarFade.left && toolbarFade.right && "[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]"
                                        )}
                                    >

                                    {/* View Group */}
                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0 min-w-min">
                                        <span className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.view")}</span>
                                        <div className="flex items-center gap-1.5">
                                            {/* Saved Views Dropdown */}
                                            <SavedViewsTabs
                                                presets={filterPresets}
                                                activePresetId={activePresetId}
                                                onSelect={(presetId) => {
                                                    setActivePresetId(presetId);
                                                    loadFilterPreset(presetId);
                                                }}
                                                onSave={(name) => {
                                                    const preset = saveFilterPreset(name);
                                                    setActivePresetId(preset.id);
                                                }}
                                                onDelete={(presetId) => {
                                                    deleteFilterPreset(presetId);
                                                    if (activePresetId === presetId) {
                                                        setActivePresetId(null);
                                                        clearFilters();
                                                    }
                                                }}
                                                onClearFilter={() => {
                                                    setActivePresetId(null);
                                                    clearFilters();
                                                }}
                                            />

                                            <div className="w-px h-8 bg-black/5 mx-0.5 orders-toolbar-divider" />

                                            {/* Layout Toggles */}
                                            {[
                                                { mode: "cards" as const, icon: LayoutGrid, label: "Cards" },
                                                { mode: "table" as const, icon: Table, label: "Table" },
                                            ].map((v) => (
                                                <button
                                                    key={v.mode}
                                                    onClick={() => setViewMode(v.mode)}
                                                    title={v.label}
                                                    className={cn(
                                                        "p-2.5 rounded-xl transition-all duration-300",
                                                        (viewMode === v.mode || (viewMode === "list" && v.mode === "cards"))
                                                            ? "bg-white text-foreground shadow-sm dark:bg-[var(--primary)] dark:text-black dark:shadow-[0_0_8px_rgba(239,255,0,0.2)] ring-1 ring-black/5"
                                                            : "text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground dark:hover:bg-white/5"
                                                    )}
                                                >
                                                    <v.icon className="w-4 h-4" />
                                                </button>
                                            ))}

                                            {/* Compact Toggle */}
                                            {(viewMode === "cards" || viewMode === "list") && (
                                                <button
                                                    onClick={() => {
                                                        const newLevel = ((compactView + 1) % 3) as 0 | 1 | 2;
                                                        setCompactView(newLevel);
                                                        localStorage.setItem("ordersCompactView", String(newLevel));
                                                    }}
                                                    className={cn(
                                                        "p-2.5 rounded-xl transition-all duration-300",
                                                        compactView === 1 && "bg-purple-100 text-purple-600 shadow-sm dark:bg-[var(--primary)] dark:text-black",
                                                        compactView === 2 && "bg-indigo-100 text-indigo-600 shadow-sm dark:bg-[var(--primary)] dark:text-black",
                                                        compactView === 0 && "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                    )}
                                                    title={compactView === 0 ? "Switch to Compact" : compactView === 1 ? "Compact View" : "Ultra Compact"}
                                                >
                                                    {compactView === 0
                                                        ? <Rows3 className="w-4 h-4" />
                                                        : compactView === 1
                                                            ? <LayoutList className="w-4 h-4" />
                                                            : <List className="w-4 h-4" />
                                                    }
                                                </button>
                                            )}

                                            {/* Grid Toggle - only visible in compact modes */}
                                            {(viewMode === "cards" || viewMode === "list") && compactView >= 1 && (
                                                <button
                                                    onClick={() => {
                                                        const newVal = !compactGrid;
                                                        setCompactGrid(newVal);
                                                        localStorage.setItem("ordersCompactGrid", String(newVal));
                                                    }}
                                                    className={cn(
                                                        "p-2.5 rounded-xl transition-all duration-300",
                                                        compactGrid
                                                            ? "bg-amber-100 text-amber-700 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                            : "text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground dark:hover:bg-white/5"
                                                    )}
                                                    title={compactGrid ? "Grid View" : "Switch to Grid"}
                                                >
                                                    <LayoutGrid className="w-4 h-4" />
                                                </button>
                                            )}

                                            <div className="w-px h-8 bg-black/5 mx-0.5 orders-toolbar-divider" />

                                            {/* Collapse Toolbar */}
                                            <button
                                                onClick={toggleToolbarCollapse}
                                                className="p-2.5 rounded-xl text-muted-foreground hover:bg-amber-200/60 hover:text-foreground transition-all duration-300 hover:rotate-90 active:scale-95"
                                                title={t("orders.tip.collapseToolbar")}
                                            >
                                                <Minimize2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Filter Group */}
                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                        <span className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.filter")}</span>
                                        <div className="flex items-center gap-1.5">
                                            {/* Date Picker */}
                                            <div>
                                                <button
                                                    ref={dateButtonRef}
                                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                                    className={cn(
                                                        "px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 border",
                                                        (filters.dateFrom || filters.dateTo)
                                                            ? "bg-lime-50 dark:bg-[#EFFF00]/5 border-lime-400 dark:border-[#EFFF00]/40 text-foreground shadow-sm"
                                                            : "border-[var(--card-border)] dark:border-white/10 text-muted-foreground hover:bg-lime-50 dark:hover:bg-[#EFFF00]/10 hover:text-foreground hover:border-lime-400/40 dark:hover:border-[#EFFF00]/40"
                                                    )}
                                                >
                                                    <CalendarDays className={cn(
                                                        "w-4 h-4 transition-colors",
                                                        (filters.dateFrom || filters.dateTo) ? "text-lime-600 dark:text-[#EFFF00]" : "text-muted-foreground group-hover:text-foreground"
                                                    )} />
                                                    <span className={cn("hidden", sidebarExpanded ? "xl:inline" : "lg:inline")}>
                                                        {ordersDateLabel(filters.dateFrom, filters.dateTo, datePreset, t)}
                                                    </span>
                                                </button>
                                                {showDatePicker && createPortal(
                                                    <div
                                                        ref={datePickerRef}
                                                        className="fixed z-[9999] orders-date-popover"
                                                        style={{ top: datePickerPos.top, left: datePickerPos.left }}
                                                    >
                                                        <DateRangePicker
                                                            inline
                                                            dateFrom={filters.dateFrom}
                                                            dateTo={filters.dateTo}
                                                            onDateChange={(from, to, presetId) => {
                                                                setFilters({ ...filters, dateFrom: from, dateTo: to });
                                                                useOrderStore.getState().setDatePreset(presetId || null);
                                                                setShowDatePicker(false);
                                                            }}
                                                        />
                                                    </div>,
                                                    document.body
                                                )}
                                            </div>

                                            {/* Advanced Filters Toggle */}
                                            <button
                                                onClick={() => {
                                                    const newValue = !showSearchBar;
                                                    setShowSearchBar(newValue);
                                                    localStorage.setItem("ordersShowSearchBar", String(newValue));
                                                }}
                                                className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    showSearchBar
                                                        ? "bg-blue-100 text-blue-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                )}
                                                title={t("orders.tip.advancedFilters")}
                                            >
                                                <SlidersHorizontal className="w-4 h-4" />
                                            </button>

                                            {/* Order Pipeline Toggle */}
                                            <button
                                                onClick={togglePipeline}
                                                className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    showPipeline
                                                        ? "bg-emerald-100 text-emerald-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                )}
                                                title={t("orders.pipeline.toggle", "Order pipeline")}
                                                aria-label={t("orders.pipeline.toggle", "Order pipeline")}
                                                aria-pressed={showPipeline}
                                            >
                                                <GitBranch className="w-4 h-4" />
                                            </button>

                                            <div className="w-px h-8 bg-black/5 mx-0.5 orders-toolbar-divider" />

                                            {/* Archive Toggle */}
                                            <button
                                                onClick={async () => {
                                                    if (!showArchived && archivedOrders.length === 0) {
                                                        await fetchArchivedOrders();
                                                    }
                                                    setShowArchived(!showArchived);
                                                }}
                                                title={showArchived ? t("orders.archived") : t("orders.archive")}
                                                aria-label={showArchived ? t("orders.archived") : t("orders.archive")}
                                                aria-pressed={showArchived}
                                                className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    showArchived
                                                        ? "bg-orange-100/50 text-orange-700 shadow-sm"
                                                        : "text-muted-foreground hover:bg-amber-100/40 hover:text-foreground"
                                                )}
                                            >
                                                <Archive className="w-4 h-4" />
                                            </button>

                                            {/* Trash Page Button */}
                                            <Link
                                                href="/orders/trash"
                                                title={t("orders.tip.trash")}
                                                aria-label={t("orders.tip.viewTrash")}
                                                className="p-2.5 rounded-xl transition-all duration-300 text-muted-foreground hover:bg-red-100/40 hover:text-red-600 flex items-center justify-center"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Tools Group - NEW */}
                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                        <span className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.tools")}</span>
                                        <div className="flex items-center gap-1.5">
                                            {/* Notifications */}
                                            <button
                                                onClick={async () => {
                                                    const newState = !notificationsEnabled;
                                                    if (newState) {
                                                        const granted = await notificationService.requestPermission();
                                                        if (granted) {
                                                            setNotificationsEnabled(true);
                                                            notificationService.showNotification({
                                                                title: "Notifications Enabled",
                                                                body: "You will now be notified of new orders",
                                                            });
                                                        }
                                                        setSoundEnabled(true);
                                                    } else {
                                                        setNotificationsEnabled(false);
                                                        setSoundEnabled(false);
                                                    }
                                                }}
                                                className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    notificationsEnabled
                                                        ? "bg-green-100 text-green-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                )}
                                                title={t("orders.tip.notifications")}
                                            >
                                                {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                                            </button>

                                            {/* Stats Toggle */}
                                            <button
                                                onClick={() => setAnalyticsLevel(analyticsLevel > 0 ? 0 : 1)}
                                                aria-pressed={analyticsLevel > 0}
                                                className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    analyticsLevel > 0
                                                        ? "bg-indigo-100 text-indigo-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                )}
                                                title={t("orders.tip.analytics")}
                                            >
                                                <BarChart3 className="w-4 h-4" />
                                            </button>

                                            {/* Meta chips toggle (off by default) */}
                                            <AdsChipsToggle active={showAdsChips} onToggle={toggleAdsChips} />

                                            {/* Prime strip under the order cards */}
                                            <PrimeTrackToggle />

                                            {/* Shield: danger slider */}
                                            <ShieldDangerToggle />

                                            {/* Map Toggle */}
                                            <button
                                                onClick={() => setShowMapPanel(prev => !prev)}
                                                className={cn(
                                                    "p-2.5 rounded-xl transition-all duration-300",
                                                    showMapPanel
                                                        ? "bg-rose-100 text-rose-600 shadow-sm dark:bg-[var(--primary)] dark:text-black"
                                                        : "text-muted-foreground hover:bg-amber-200/60 hover:text-foreground dark:hover:bg-white/5"
                                                )}
                                                title={t("map.title")}
                                            >
                                                <MapPin className="w-4 h-4" />
                                            </button>

                                            {/* Undo Button */}
                                            <AnimatePresence>
                                                {canUndo && (
                                                    <motion.button
                                                        initial={{ opacity: 0, scale: 0.8 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.8 }}
                                                        onClick={async () => {
                                                            // The result was discarded, so a refused undo looked
                                                            // identical to a successful one.
                                                            const result = await undoLastAction();
                                                            if (result.success) {
                                                                toast.success(t("orders.toast.undone"), result.undoneAction);
                                                            } else if (result.error) {
                                                                toast.warning(t("orders.toast.nothingUndone"), result.error);
                                                            }
                                                        }}
                                                        className="p-2.5 rounded-xl bg-lime-100/50 text-lime-700 hover:bg-lime-100 transition-all shadow-sm"
                                                        title={t("orders.tip.undoLast")}
                                                    >
                                                        <RotateCcw className="w-4 h-4" />
                                                    </motion.button>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>

                                    {/* Export Group */}
                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                        <span className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.export")}</span>
                                        <div className="flex items-center gap-1.5">

                                            <button
                                                onClick={() => setIsExportModalOpen(true)}
                                                className="p-2.5 rounded-xl text-muted-foreground hover:bg-amber-200/60 hover:text-foreground transition-all duration-300"
                                                title={t("orders.ui.export")}
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShipConfirmCompany('prime');
                                                    setShipConfirmKey(k => k + 1);
                                                    setShipConfirmOpen(true);
                                                }}
                                                className="p-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 shadow-lg shadow-slate-900/20 transition-all duration-300 flex items-center gap-2"
                                                title={t("orders.ui.shipViaPrime")}
                                            >
                                                <Truck className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Group */}
                                    <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white/40 backdrop-blur-md border border-white/20 shadow-sm orders-toolbar-group flex-shrink-0">
                                        <span className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-widest px-2">{t("orders.toolbar.actions")}</span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => setIsReturnsOpen(true)}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 hover:-translate-y-0.5 transition-all duration-300 font-bold text-sm"
                                                title={t("orders.tip.returnsCockpit")}
                                            >
                                                <PackageX className="w-4 h-4" />
                                                <span className="whitespace-nowrap hidden lg:inline">{t("orders.ui.returns")}</span>
                                            </button>
                                            <button
                                                onClick={() => setIsCreateModalOpen(true)}
                                                className="group relative px-4 py-2.5 rounded-xl bg-foreground text-background hover:bg-foreground/90 dark:bg-[var(--primary)] dark:text-[var(--primary-fg)] dark:hover:bg-[var(--primary)] dark:shadow-[0_0_15px_rgba(239,255,0,0.3)] dark:hover:shadow-[0_0_20px_rgba(239,255,0,0.5)] hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                                            >
                                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                                <div className="relative flex items-center gap-2 font-bold text-sm">
                                                    <Plus className="w-4 h-4" />
                                                    {!sidebarExpanded && (
                                                        <>
                                                            <span className="whitespace-nowrap hidden lg:inline">{t("orders.newOrder")}</span>
                                                            <span className="whitespace-nowrap lg:hidden">{t("orders.newOrderShort")}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                </div>
                            </motion.div>

                            {/* Saved Views Tabs */}
                            {/* Old Saved Views Location Removed */}

                            {/* Collapsible Analytics Panel */}
                            <OrdersAnalyticsPanel
                                open={analyticsLevel > 0}
                                filters={filters}
                                setFilters={setFilters}
                                flaggedCount={flaggedCount}
                                attentionCounts={attentionCounts}
                                countsHidden={!countVis.chips}
                                flaggedCountHidden={!countVis.flaggedCard}
                            />

                            {/* Order Pipeline — collapsible funnel overview, sits above the search bar (hidden by default) */}
                            <AnimatePresence initial={false}>
                                {showPipeline && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3, ease: EASE_PANEL }}
                                        className="overflow-hidden"
                                    >
                                        <div className="pb-4">
                                            <OrderPipeline
                                                statusCounts={statusCounts}
                                                countsHidden={!countVis.chips}
                                                activeStatus={typeof filters.status === "string" ? filters.status : undefined}
                                                onSelectStatus={(status) =>
                                                    setFilters({ ...filters, status: status as Order["status"] | undefined })
                                                }
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Shield danger section — switched on from the Shield slider */}
                            <AnimatePresence initial={false}>
                                {showDangerPanel && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3, ease: EASE_PANEL }}
                                        className="overflow-hidden"
                                    >
                                        <div className="pb-4">
                                            <ShieldDangerPanel
                                                counts={dangerBandCounts}
                                                listTotal={dangerListTotal}
                                                active={dangerBand}
                                                onSelect={setDangerBand}
                                                onClose={() => setShowDangerPanel(false)}
                                                countsHidden={!countVis.chips}
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Filters & Search Bar */}
                            <OrdersFilterBar
                                bulkActions={guardedBulkActions}
                                isBulkProcessing={isBulkProcessing}
                                hasActiveFilters={hasActiveFilters}
                                totalRiskCount={totalRiskCount}
                                dueTodayCount={dueTodayCount}
                                countsHidden={!countVis.chips}
                                dueTodayCountHidden={!countVis.dueTodayBadge}
                                riskCountHidden={!countVis.riskBadge}
                                showSubFilters={showSubFilters}
                                toggleSubFilters={toggleSubFilters}
                                showAdChannels={showAdChannels}
                                toggleAdChannels={toggleAdChannels}
                                onOpenScanner={() => setIsScannerOpen(true)}
                            />

                            {/* Mobile Sticky Filter Bar - Rendered outside overflow-hidden container */}
                            {isMobile && showSearchBar && (
                                <StickyFilterBar
                                    filters={filters}
                                    setFilters={setFilters}
                                    statusCounts={statusCounts}
                                    totalRiskCount={totalRiskCount}
                                    showFilters={showFilters}
                                    setShowFilters={setShowFilters}
                                    hasActiveFilters={hasActiveFilters}
                                    groupBy={groupBy}
                                    setGroupBy={setGroupBy}
                                    filterDuplicatesOnly={filterDuplicatesOnly}
                                    setFilterDuplicatesOnly={setFilterDuplicatesOnly}
                                    filterDueToday={filterDueToday}
                                    setFilterDueToday={setFilterDueToday}
                                    dueTodayCount={dueTodayCount}
                                    countsHidden={!countVis.chips}
                                    dueTodayCountHidden={!countVis.dueTodayBadge}
                                    riskCountHidden={!countVis.riskBadge}
                                    showSubFilters={showSubFilters}
                                    isMobile={true}
                                />
                            )}

                        </motion.div>
                    )}
                </AnimatePresence>

            </motion.div>
        </>
    );
}
