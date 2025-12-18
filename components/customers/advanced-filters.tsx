"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Filter,
    X,
    MapPin,
    Calendar,
    DollarSign,
    ShoppingBag,
    SortAsc,
    SortDesc,
    ChevronDown,
} from "lucide-react";
import { CustomerFilters } from "@/hooks/use-customers";
import { cn } from "@/lib/utils";

interface AdvancedFiltersProps {
    filters: CustomerFilters;
    onChange: (filters: CustomerFilters) => void;
    cities: string[];
    products: string[];
}

export function AdvancedFilters({ filters, onChange, cities, products }: AdvancedFiltersProps) {
    const [isOpen, setIsOpen] = useState(false);

    const hasActiveFilters =
        filters.city ||
        filters.dateRange ||
        filters.minSpend !== undefined ||
        filters.productName ||
        (filters.sortBy && filters.sortBy !== "lastOrder");

    const clearFilters = () => {
        onChange({
            ...filters,
            city: undefined,
            dateRange: undefined,
            minSpend: undefined,
            maxSpend: undefined,
            productName: undefined,
            sortBy: "lastOrder",
            sortOrder: "desc",
        });
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all",
                    hasActiveFilters
                        ? "bg-[var(--foreground)] text-white border-transparent"
                        : "bg-[var(--card-bg)] text-foreground border-[var(--card-border)] hover:border-foreground"
                )}
            >
                <Filter className="w-4 h-4" />
                Advanced Filters
                {hasActiveFilters && (
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                        {[filters.city, filters.dateRange, filters.minSpend, filters.productName].filter(Boolean).length}
                    </span>
                )}
                <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 top-full mt-2 z-50 w-80 bg-[var(--card-bg)] rounded-2xl shadow-xl border border-[var(--card-border)] overflow-hidden"
                    >
                        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
                            <h3 className="font-semibold text-foreground">Advanced Filters</h3>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline">
                                    Clear All
                                </button>
                            )}
                        </div>

                        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
                            {/* City Filter */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                                    <MapPin className="w-4 h-4" />
                                    City
                                </label>
                                <select
                                    value={filters.city || ""}
                                    onChange={(e) => onChange({ ...filters, city: e.target.value || undefined })}
                                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                >
                                    <option value="">All Cities</option>
                                    {cities.map((city) => (
                                        <option key={city} value={city}>{city}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Product Filter */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                                    <ShoppingBag className="w-4 h-4" />
                                    Bought Product
                                </label>
                                <select
                                    value={filters.productName || ""}
                                    onChange={(e) => onChange({ ...filters, productName: e.target.value || undefined })}
                                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                >
                                    <option value="">Any Product</option>
                                    {products.map((product) => (
                                        <option key={product} value={product}>{product}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Date Range */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                                    <Calendar className="w-4 h-4" />
                                    Last Order Date
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="date"
                                        value={filters.dateRange?.start || ""}
                                        onChange={(e) => onChange({
                                            ...filters,
                                            dateRange: {
                                                start: e.target.value,
                                                end: filters.dateRange?.end || new Date().toISOString().split("T")[0],
                                            },
                                        })}
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                    <input
                                        type="date"
                                        value={filters.dateRange?.end || ""}
                                        onChange={(e) => onChange({
                                            ...filters,
                                            dateRange: {
                                                start: filters.dateRange?.start || "2020-01-01",
                                                end: e.target.value,
                                            },
                                        })}
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                            </div>

                            {/* Spend Range */}
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                                    <DollarSign className="w-4 h-4" />
                                    Total Spent (IQD)
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        value={filters.minSpend || ""}
                                        onChange={(e) => onChange({ ...filters, minSpend: e.target.value ? Number(e.target.value) : undefined })}
                                        placeholder="Min"
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                    <input
                                        type="number"
                                        value={filters.maxSpend || ""}
                                        onChange={(e) => onChange({ ...filters, maxSpend: e.target.value ? Number(e.target.value) : undefined })}
                                        placeholder="Max"
                                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    />
                                </div>
                            </div>

                            {/* Sort By */}
                            <div>
                                <label className="text-sm font-medium text-foreground mb-2 block">Sort By</label>
                                <div className="flex gap-2">
                                    <select
                                        value={filters.sortBy || "lastOrder"}
                                        onChange={(e) => onChange({ ...filters, sortBy: e.target.value as CustomerFilters["sortBy"] })}
                                        className="flex-1 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                    >
                                        <option value="lastOrder">Last Order</option>
                                        <option value="name">Name</option>
                                        <option value="orders">Total Orders</option>
                                        <option value="spent">Total Spent</option>
                                    </select>
                                    <button
                                        onClick={() => onChange({ ...filters, sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" })}
                                        className="w-10 h-10 flex items-center justify-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl hover:bg-[var(--card-border)] transition-colors"
                                    >
                                        {filters.sortOrder === "asc" ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-[var(--card-border)]">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-full py-2 bg-[var(--foreground)] text-white rounded-xl font-medium hover:opacity-90"
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
