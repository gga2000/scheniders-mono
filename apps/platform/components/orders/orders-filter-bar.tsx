"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    Bookmark,
    CalendarClock,
    ChevronDown,
    CreditCard,
    MapPin,
    MessageCircle,
    Package,
    Save,
    Trash2,
    X,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrderStore } from "@/store/use-order-store";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { EASE_PANEL } from "@/components/layout/page-transition";
import { GlobalSearchField } from "@/components/orders/global-search-field";
import { StickyFilterBar } from "@/components/orders/sticky-filter-bar";
import { AdChannelFilter } from "@/components/orders/ad-channel-filter";
import { AdCampaignFilter } from "@/components/orders/ad-campaign-filter";
import { LeadQualityStrip } from "@/components/orders/lead-quality-strip";
import { StuckTransitChip } from "@/components/orders/stuck-transit-chip";
import { PaymentUncheckedChip } from "@/components/orders/payment-unchecked-chip";
import { TagFilterChip } from "@/components/orders/tags/tag-filter-chip";
import type { PaymentStatus } from "@/lib/supabase";

/**
 * Bulk status actions, as one object rather than ten props.
 *
 * They are byte-identical apart from the status they apply (see the factory in
 * app/orders/page.tsx), so passing them individually would have made the
 * extraction's interface larger than the thing being extracted.
 */
export interface OrdersBulkActions {
    confirm: () => void;
    contacted: () => void;
    deliver: () => void;
    reject: () => void;
    completed: () => void;
    inTransit: () => void;
    noResponse: () => void;
    setNew: () => void;
    archive: () => void;
    remove: () => void;
    suspend: () => void;
    reschedule: () => void;
}

interface OrdersFilterBarProps {
    bulkActions: OrdersBulkActions;
    isBulkProcessing: boolean;
    /** Whether any narrowing filter beyond status is applied. */
    hasActiveFilters: boolean;
    /** Orders flagged across the whole set, for the risk shortcut. */
    totalRiskCount: number;
    /** Size of the "due today" queue — postponed orders whose day has arrived. */
    dueTodayCount: number;
    /** Hide status, product and channel numbers (lib/orders/count-visibility.ts). */
    countsHidden?: boolean;
    dueTodayCountHidden?: boolean;
    riskCountHidden?: boolean;
    showSubFilters: boolean;
    toggleSubFilters: () => void;
    /** Whether the ad-channel chip row is shown; off by default (app/orders/page.tsx). */
    showAdChannels: boolean;
    toggleAdChannels: () => void;
    onOpenScanner: () => void;
}

/**
 * The orders filter and search bar, with its saved views and bulk action row.
 *
 * ARCH-1: lifted out of app/orders/page.tsx verbatim. The markup is unchanged —
 * the layout is approved. Everything this needs that already lives in the order
 * store or the orders context is read from there rather than threaded through
 * props: passing it down would have traded 300 lines of page for a 50-prop
 * interface, which is not an improvement.
 */
export function OrdersFilterBar({
    bulkActions,
    isBulkProcessing,
    hasActiveFilters,
    totalRiskCount,
    dueTodayCount,
    countsHidden = false,
    dueTodayCountHidden = false,
    riskCountHidden = false,
    showSubFilters,
    toggleSubFilters,
    showAdChannels,
    toggleAdChannels,
    onOpenScanner,
}: OrdersFilterBarProps) {
    const { t } = useLanguage();
    const isMobile = useIsMobile();

    const {
        filters,
        setFilters,
        clearFilters,
        statusCounts,
        availableCities,
        availableProducts,
        availableProductsInView,
        adChannelSummary,
        adCampaignSummary,
        adCampaignQuality,
        filterPresets,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,
        bulkUpdateStatus,
    } = useOrdersContext();

    const {
        showSearchBar,
        showFilters, setShowFilters,
        showPresets, setShowPresets,
        newPresetName, setNewPresetName,
        groupBy, setGroupBy,
        filterDuplicatesOnly, setFilterDuplicatesOnly,
        filterDueToday, setFilterDueToday,
        selectedOrders, setSelectedOrders,
        isFilterPanelAnimating, setIsFilterPanelAnimating,
        setTemplatePanelOpen,
    } = useOrderStore(
        useShallow((s) => ({
            showSearchBar: s.showSearchBar,
            showFilters: s.showFilters,
            setShowFilters: s.setShowFilters,
            showPresets: s.showPresets,
            setShowPresets: s.setShowPresets,
            newPresetName: s.newPresetName,
            setNewPresetName: s.setNewPresetName,
            groupBy: s.groupBy,
            setGroupBy: s.setGroupBy,
            filterDuplicatesOnly: s.filterDuplicatesOnly,
            setFilterDuplicatesOnly: s.setFilterDuplicatesOnly,
            filterDueToday: s.filterDueToday,
            setFilterDueToday: s.setFilterDueToday,
            selectedOrders: s.selectedOrders,
            setSelectedOrders: s.setSelectedOrders,
            isFilterPanelAnimating: s.isFilterPanelAnimating,
            setIsFilterPanelAnimating: s.setIsFilterPanelAnimating,
            setTemplatePanelOpen: s.setTemplatePanelOpen,
        })),
    );

    return (
        <AnimatePresence initial={false}>
            {showSearchBar && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: EASE_PANEL }}
                    onAnimationStart={() => setIsFilterPanelAnimating(true)}
                    onAnimationComplete={() => setIsFilterPanelAnimating(false)}
                    className={cn(
                        isFilterPanelAnimating ? "overflow-hidden" : "overflow-visible"
                    )}
                >
                    <div className="pastel-card p-6 space-y-4 orders-search-panel">
                        <div className="flex flex-col lg:flex-row gap-4">
                            <GlobalSearchField
                                setFilters={setFilters}
                                onScannerOpen={() => onOpenScanner()}
                                subFiltersOpen={showSubFilters}
                                onToggleSubFilters={toggleSubFilters}
                                adChannelsOpen={showAdChannels}
                                onToggleAdChannels={toggleAdChannels}
                                inputClassName="w-full pl-12 pr-28 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] focus:border-transparent transition-all dark:focus:ring-[rgba(0,255,255,0.4)] dark:focus:border-[rgba(0,255,255,0.5)] dark:focus:shadow-[0_0_15px_rgba(0,255,255,0.1)]"
                            />
                            {/* Sort dropdown removed in favor of column sorting */}
                        </div>

                        {!isMobile && (
                            <StickyFilterBar
                                filters={filters}
                                setFilters={setFilters}
                                statusCounts={statusCounts}
                                productsInView={availableProductsInView}
                                totalRiskCount={totalRiskCount}
                                showFilters={showFilters}
                                setShowFilters={setShowFilters}
                                hasActiveFilters={hasActiveFilters}
                                groupBy={groupBy}
                                setGroupBy={setGroupBy}
                                filterDuplicatesOnly={filterDuplicatesOnly}
                                setFilterDuplicatesOnly={setFilterDuplicatesOnly}
                                filterDueToday={filterDueToday}
                                queueChips={<><StuckTransitChip filters={filters} setFilters={setFilters} /><PaymentUncheckedChip filters={filters} setFilters={setFilters} /><TagFilterChip /></>}
                                setFilterDueToday={setFilterDueToday}
                                dueTodayCount={dueTodayCount}
                                countsHidden={countsHidden}
                                dueTodayCountHidden={dueTodayCountHidden}
                                riskCountHidden={riskCountHidden}
                                showSubFilters={showSubFilters}
                                isMobile={false}
                            />
                        )}

                        {/* Which ad channel brought these orders in. Hidden until the
                            search-bar toggle turns it on, except while a channel is
                            pinned: a filter narrowing the list must stay visible. */}
                        {(showAdChannels || filters.adChannel) && (
                            <AdChannelFilter
                                summary={adChannelSummary}
                                selected={filters.adChannel}
                                onSelect={(channel) => setFilters({ ...filters, adChannel: channel ?? undefined })}
                                countsHidden={countsHidden}
                                className="pl-8 pr-6"
                            />
                        )}
                        {(showAdChannels || filters.adCampaign) && (
                            <AdCampaignFilter
                                summary={adCampaignSummary}
                                selected={filters.adCampaign}
                                onSelect={(campaign) => setFilters({ ...filters, adCampaign: campaign ?? undefined })}
                                countsHidden={countsHidden}
                                className="pl-8 pr-6"
                            />
                        )}
                        {filters.adCampaign && adCampaignQuality && !countsHidden && (
                            <LeadQualityStrip
                                quality={adCampaignQuality}
                                campaign={adCampaignSummary.stats.find((s) => s.key === filters.adCampaign)?.label ?? filters.adCampaign}
                                className="pl-8 pr-6"
                            />
                        )}

                        {/* Advanced Filters Panel */}
                        <AnimatePresence>
                            {showFilters && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="pt-4 border-t border-[var(--card-border)] space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            {/* City Filter */}
                                            <div>
                                                <label className="text-xs text-muted font-medium block mb-1.5">{t("orders.filter.city")}</label>
                                                <div className="relative">
                                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                    <select
                                                        value={filters.city || ""}
                                                        onChange={(e) => setFilters({ ...filters, city: e.target.value || undefined })}
                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                    >
                                                        <option value="">{t("orders.filter.allCities")}</option>
                                                        {availableCities.map((city) => (
                                                            <option key={city} value={city}>{city}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                </div>
                                            </div>

                                            {/* Product Filter */}
                                            <div>
                                                <label className="text-xs text-muted font-medium block mb-1.5">{t("orders.filter.product")}</label>
                                                <div className="relative">
                                                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                    <select
                                                        value={filters.product || ""}
                                                        onChange={(e) => setFilters({ ...filters, product: e.target.value || undefined })}
                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                    >
                                                        <option value="">{t("orders.filter.allProducts")}</option>
                                                        {availableProducts.map((product) => (
                                                            <option key={product} value={product}>{product}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                </div>
                                            </div>

                                            {/* Payment Status Filter */}
                                            <div>
                                                <label className="text-xs text-muted font-medium block mb-1.5">{t("orders.filter.payment")}</label>
                                                <div className="relative">
                                                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                                    <select
                                                        value={filters.paymentStatus || ""}
                                                        onChange={(e) => setFilters({ ...filters, paymentStatus: (e.target.value as PaymentStatus) || undefined })}
                                                        className="w-full pl-10 pr-4 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all appearance-none cursor-pointer"
                                                    >
                                                        <option value="">{t("orders.filter.allPayments")}</option>
                                                        <option value="cod">{t("orders.filter.paymentCoD")}</option>
                                                        <option value="prepaid">{t("orders.filter.paymentPrepaid")}</option>
                                                        <option value="pending">{t("orders.filter.paymentPending")}</option>
                                                        <option value="partial">{t("orders.filter.paymentPartial")}</option>
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                                </div>
                                            </div>
                                        </div>
                                        {/* Filter Actions Row */}
                                        <div className="flex flex-wrap items-center gap-3">
                                            {/* Clear Filters Button */}
                                            {hasActiveFilters && (
                                                <button
                                                    onClick={clearFilters}
                                                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                    {t("orders.ui.clearAllFilters")}
                                                </button>
                                            )}

                                            {/* Toggle Presets */}
                                            <button
                                                onClick={() => setShowPresets(!showPresets)}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all",
                                                    showPresets || filterPresets.length > 0
                                                        ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                                        : "text-muted hover:text-foreground hover:bg-gray-50"
                                                )}
                                            >
                                                <Bookmark className="w-3.5 h-3.5" />
                                                {t("orders.ui.presets")} {filterPresets.length > 0 && `(${filterPresets.length})`}
                                            </button>
                                        </div>

                                        {/* Filter Presets Panel */}
                                        <AnimatePresence>
                                            {showPresets && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="pt-3 border-t border-dashed border-[var(--card-border)] space-y-3">
                                                        {/* Save Current Filter */}
                                                        {hasActiveFilters && (
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder={t("orders.tip.nameFilter")}
                                                                    value={newPresetName}
                                                                    onChange={(e) => setNewPresetName(e.target.value)}
                                                                    className="flex-1 px-3 py-2 text-sm bg-white border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-200"
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        if (newPresetName.trim()) {
                                                                            saveFilterPreset(newPresetName.trim());
                                                                            setNewPresetName("");
                                                                        }
                                                                    }}
                                                                    disabled={!newPresetName.trim()}
                                                                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all disabled:opacity-50"
                                                                >
                                                                    <Save className="w-3.5 h-3.5" />
                                                                    {t("common.save")}
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Saved Presets List */}
                                                        {filterPresets.length > 0 ? (
                                                            <div className="flex flex-wrap gap-2">
                                                                {filterPresets.map((preset) => (
                                                                    <div
                                                                        key={preset.id}
                                                                        className="flex items-center gap-1 pl-3 pr-1 py-1.5 bg-purple-50 border border-purple-100 rounded-lg group"
                                                                    >
                                                                        <button
                                                                            onClick={() => loadFilterPreset(preset.id)}
                                                                            className="text-sm text-purple-700 hover:text-purple-900 font-medium"
                                                                        >
                                                                            {preset.name}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => deleteFilterPreset(preset.id)}
                                                                            className="p-1 text-purple-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-muted">{t("orders.filter.noSavedFilters")}</p>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {selectedOrders.size > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className={cn("flex items-center gap-3 pt-4 border-t border-[var(--card-border)] overflow-x-auto scrollbar-hide", isBulkProcessing && "pointer-events-none opacity-50")}
                                >
                                    <span className="text-sm text-muted whitespace-nowrap">{selectedOrders.size} {t("orders.selected")}</span>

                                    {/* Primary Actions */}
                                    <button
                                        onClick={bulkActions.confirm}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--pastel-green)] text-green-900 text-sm font-medium hover:bg-[var(--pastel-green-light)] transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.confirm")}
                                    </button>
                                    <button
                                        onClick={bulkActions.deliver}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--pastel-purple)] text-purple-900 text-sm font-medium hover:bg-[var(--pastel-purple-light)] transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.deliver")}
                                    </button>
                                    <button
                                        onClick={bulkActions.reject}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--pastel-pink)] text-rose-900 text-sm font-medium hover:bg-[var(--pastel-pink-light)] transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.reject")}
                                    </button>
                                    <button
                                        onClick={bulkActions.archive}
                                        className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-300 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.archive")}
                                    </button>

                                    {/* WhatsApp Bulk Send */}
                                    <button
                                        onClick={() => setTemplatePanelOpen(true)}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-all whitespace-nowrap flex items-center gap-1.5"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        {t("orders.bulk.sendTemplate") || "إرسال رسالة واتساب"}
                                    </button>

                                    {/* Divider */}
                                    <div className="h-6 w-px bg-[var(--card-border)] flex-shrink-0" />

                                    {/* Status Change Buttons */}
                                    <button
                                        onClick={bulkActions.setNew}
                                        className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.new")}
                                    </button>
                                    <button
                                        onClick={bulkActions.contacted}
                                        className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.contacted")}
                                    </button>
                                    <button
                                        onClick={bulkActions.inTransit}
                                        className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-sm font-medium hover:bg-orange-200 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.inTransit")}
                                    </button>
                                    <button
                                        onClick={bulkActions.completed}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-medium hover:bg-emerald-200 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.completed")}
                                    </button>
                                    <button
                                        onClick={bulkActions.suspend}
                                        className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-sm font-medium hover:bg-orange-200 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.suspended")}
                                    </button>
                                    <button
                                        onClick={bulkActions.noResponse}
                                        className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.status.noResponse")}
                                    </button>

                                    {/* Postpone to another day */}
                                    <button
                                        onClick={bulkActions.reschedule}
                                        className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 text-sm font-medium hover:bg-sky-200 transition-all whitespace-nowrap flex items-center gap-1.5"
                                    >
                                        <CalendarClock className="w-4 h-4" />
                                        {t("orders.bulk.reschedule")}
                                    </button>

                                    {/* Divider */}
                                    <div className="h-6 w-px bg-[var(--card-border)] flex-shrink-0" />

                                    {/* Destructive Action */}
                                    <button
                                        onClick={bulkActions.remove}
                                        className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-all whitespace-nowrap"
                                    >
                                        {t("orders.bulk.delete")}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
