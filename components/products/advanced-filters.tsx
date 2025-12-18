"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdvancedFiltersProps {
    onApply: (filters: FilterValues) => void;
    onReset: () => void;
}

export interface FilterValues {
    priceMin: number | null;
    priceMax: number | null;
    salesMin: number | null;
    salesMax: number | null;
    revenueMin: number | null;
    revenueMax: number | null;
    stockStatus: "all" | "in_stock" | "low_stock" | "out_of_stock";
    showArchived: boolean;
}

const defaultFilters: FilterValues = {
    priceMin: null,
    priceMax: null,
    salesMin: null,
    salesMax: null,
    revenueMin: null,
    revenueMax: null,
    stockStatus: "all",
    showArchived: false,
};

export function AdvancedFilters({ onApply, onReset }: AdvancedFiltersProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [filters, setFilters] = useState<FilterValues>(defaultFilters);

    const handleReset = () => {
        setFilters(defaultFilters);
        onReset();
    };

    const handleApply = () => {
        onApply(filters);
    };

    const hasActiveFilters =
        filters.priceMin !== null ||
        filters.priceMax !== null ||
        filters.salesMin !== null ||
        filters.salesMax !== null ||
        filters.revenueMin !== null ||
        filters.revenueMax !== null ||
        filters.stockStatus !== "all" ||
        filters.showArchived;

    return (
        <div className="relative">
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-xl border transition-all",
                    hasActiveFilters
                        ? "bg-[var(--pastel-yellow)] border-amber-200 text-amber-900"
                        : "bg-[var(--background)] border-[var(--card-border)] text-foreground hover:border-[var(--foreground)]"
                )}
            >
                <Filter className="w-4 h-4" />
                <span className="font-medium">Filters</span>
                {hasActiveFilters && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">
                        !
                    </span>
                )}
                {isOpen ? (
                    <ChevronUp className="w-4 h-4" />
                ) : (
                    <ChevronDown className="w-4 h-4" />
                )}
            </button>

            {/* Filter Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 top-full mt-2 z-50 w-80 bg-[var(--card-bg)] rounded-2xl shadow-lg border border-[var(--card-border)] overflow-hidden"
                    >
                        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
                            <h3 className="font-semibold text-foreground">Advanced Filters</h3>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-[var(--background)] rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4 text-muted" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                            {/* Price Range */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Price Range (IQD)
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        value={filters.priceMin ?? ""}
                                        onChange={(e) => setFilters((prev) => ({
                                            ...prev,
                                            priceMin: e.target.value ? parseFloat(e.target.value) : null,
                                        }))}
                                        placeholder="Min"
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                    <input
                                        type="number"
                                        value={filters.priceMax ?? ""}
                                        onChange={(e) => setFilters((prev) => ({
                                            ...prev,
                                            priceMax: e.target.value ? parseFloat(e.target.value) : null,
                                        }))}
                                        placeholder="Max"
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                            </div>

                            {/* Sales Range */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Sales Count
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        value={filters.salesMin ?? ""}
                                        onChange={(e) => setFilters((prev) => ({
                                            ...prev,
                                            salesMin: e.target.value ? parseInt(e.target.value) : null,
                                        }))}
                                        placeholder="Min"
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                    <input
                                        type="number"
                                        value={filters.salesMax ?? ""}
                                        onChange={(e) => setFilters((prev) => ({
                                            ...prev,
                                            salesMax: e.target.value ? parseInt(e.target.value) : null,
                                        }))}
                                        placeholder="Max"
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                            </div>

                            {/* Stock Status */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Stock Status
                                </label>
                                <select
                                    value={filters.stockStatus}
                                    onChange={(e) => setFilters((prev) => ({
                                        ...prev,
                                        stockStatus: e.target.value as FilterValues["stockStatus"],
                                    }))}
                                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                >
                                    <option value="all">All</option>
                                    <option value="in_stock">In Stock</option>
                                    <option value="low_stock">Low Stock</option>
                                    <option value="out_of_stock">Out of Stock</option>
                                </select>
                            </div>

                            {/* Show Archived */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="showArchived"
                                    checked={filters.showArchived}
                                    onChange={(e) => setFilters((prev) => ({
                                        ...prev,
                                        showArchived: e.target.checked,
                                    }))}
                                    className="w-4 h-4 rounded border-[var(--card-border)] text-[var(--foreground)] focus:ring-[var(--pastel-yellow)]"
                                />
                                <label htmlFor="showArchived" className="text-sm text-foreground">
                                    Show archived products
                                </label>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="p-4 border-t border-[var(--card-border)] flex gap-2">
                            <button
                                onClick={handleReset}
                                className="flex-1 px-4 py-2 bg-[var(--background)] text-foreground rounded-lg text-sm font-medium hover:bg-[var(--card-border)] transition-colors"
                            >
                                Reset
                            </button>
                            <button
                                onClick={handleApply}
                                className="flex-1 px-4 py-2 bg-[var(--foreground)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
                            >
                                Apply Filters
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
