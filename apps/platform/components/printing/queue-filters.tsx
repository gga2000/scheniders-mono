"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, MapPin, Search, X } from "lucide-react";
import { DateRangePicker } from "@scheniders/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PrintingFilters } from "@/hooks/use-printing";
import type { Order } from "@/lib/supabase";

export type SortBy = "priority" | "date" | "city" | "price";

interface QueueFiltersProps {
    filters: PrintingFilters;
    onFiltersChange: (filters: PrintingFilters) => void;
    onClear: () => void;
    availableCities: string[];
    sortBy: SortBy;
    onSortByChange: (sortBy: SortBy) => void;
    autoShip: boolean;
    onAutoShipChange: (autoShip: boolean) => void;
}

export function QueueFilters({
    filters,
    onFiltersChange,
    onClear,
    availableCities,
    sortBy,
    onSortByChange,
    autoShip,
    onAutoShipChange,
}: QueueFiltersProps) {
    const { t } = useLanguage();
    const [showDatePicker, setShowDatePicker] = useState(false);

    return (
            <div className="pastel-card p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-row lg:gap-4">
                    {/* Search */}
                    <div className="relative col-span-2 lg:col-span-1 lg:flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
                        <input
                            type="text"
                            placeholder={t("printing.searchPlaceholder")}
                            value={filters.searchQuery || ""}
                            onChange={(e) =>
                                onFiltersChange({
                                    ...filters,
                                    searchQuery: e.target.value || undefined,
                                })
                            }
                            className="w-full pl-12 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)] transition-all"
                        />
                    </div>

                    {/* City Filter */}
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                        <select
                            value={filters.city || ""}
                            onChange={(e) =>
                                onFiltersChange({
                                    ...filters,
                                    city: e.target.value || undefined,
                                })
                            }
                            className="pl-10 pr-8 py-3 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)] appearance-none cursor-pointer w-full lg:w-auto lg:min-w-[150px]"
                        >
                            <option value="">{t("printing.allCities")}</option>
                            {availableCities.map((city) => (
                                <option key={city} value={city}>
                                    {city}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                    </div>

                    {/* Sort */}
                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={(e) => onSortByChange(e.target.value as SortBy)}
                            className="pl-4 pr-8 py-3 text-sm bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)] appearance-none cursor-pointer w-full lg:w-auto"
                        >
                            <option value="priority">{t("printing.sortPriority")}</option>
                            <option value="date">{t("printing.sortDate")}</option>
                            <option value="city">{t("printing.sortCity")}</option>
                            <option value="price">{t("printing.sortPrice")}</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                    </div>

                    {/* Date Range */}
                    <div className="relative col-span-2 lg:col-span-1">
                        <button
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className={cn(
                                "p-3 rounded-2xl border transition-all shadow-sm flex items-center gap-2 w-full lg:w-auto",
                                (filters.dateFrom || filters.dateTo)
                                    ? "bg-amber-100 border-amber-200 text-amber-700"
                                    : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                            )}
                            title={t("printing.dateFilter")}
                        >
                            <CalendarDays className="w-4 h-4" />
                            <span className="text-sm lg:hidden">{t("printing.dateFilter")}</span>
                            {filters.dateFrom && (
                                <span className="text-xs font-medium hidden sm:inline">
                                    {filters.dateFrom === filters.dateTo
                                        ? new Date(filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                        : `${new Date(filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${filters.dateTo ? new Date(filters.dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...'}`
                                    }
                                </span>
                            )}
                        </button>

                        {showDatePicker && (
                            <div className="absolute right-0 top-full mt-2 z-50 shadow-2xl rounded-3xl">
                                <DateRangePicker
                                    inline
                                    dateFrom={filters.dateFrom}
                                    dateTo={filters.dateTo}
                                    onDateChange={(from, to) => {
                                        onFiltersChange({
                                            ...filters,
                                            dateFrom: from,
                                            dateTo: to,
                                        });
                                        setShowDatePicker(false);
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Clear Filters */}
                    {(filters.searchQuery ||
                        filters.city ||
                        filters.dateFrom) && (
                            <button
                                onClick={onClear}
                                className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center gap-2"
                            >
                                <X className="w-4 h-4" />
                                {t("printing.clear")}
                            </button>
                        )}
                </div>

                {/* Priority Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted mr-2">{t("printing.priority")}</span>
                    {["all", "urgent", "high", "normal"].map((priority) => (
                        <button
                            key={priority}
                            onClick={() =>
                                onFiltersChange({
                                    ...filters,
                                    priority: priority === "all" ? undefined : (priority as Order["priority"]),
                                })
                            }
                            className={cn(
                                "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                (priority === "all" && !filters.priority) ||
                                    filters.priority === priority
                                    ? priority === "urgent"
                                        ? "bg-red-500 text-white"
                                        : priority === "high"
                                            ? "bg-orange-500 text-white"
                                            : "bg-[var(--ink)] text-white"
                                    : "bg-[var(--background)] border border-[var(--card-border)] text-muted hover:bg-[var(--card-border)]"
                            )}
                        >
                            {t(`printing.priority_${priority}`)}
                        </button>
                    ))}

                    {/* Auto-ship toggle */}
                    <div className="flex w-full items-center justify-between gap-2 sm:ml-auto sm:w-auto">
                        <span className="text-sm text-muted">{t("printing.autoShip")}</span>
                        <button
                            onClick={() => onAutoShipChange(!autoShip)}
                            className={cn(
                                "w-10 h-6 rounded-full transition-all relative",
                                autoShip ? "bg-green-500" : "bg-gray-300"
                            )}
                        >
                            <div
                                className={cn(
                                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow",
                                    autoShip ? "left-5" : "left-1"
                                )}
                            />
                        </button>
                    </div>
                </div>
            </div>
    );
}
