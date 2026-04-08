"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, X, Calendar, DollarSign, Tag as TagIcon } from "lucide-react";
import { useCustomerTags } from "@/hooks/use-customer-management";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { cn } from "@/lib/utils";
import { tagColorClasses } from "@/types/customer";

interface AdvancedFiltersProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AdvancedCustomerFilters({ isOpen, onClose }: AdvancedFiltersProps) {
    const { state, setAdvancedFilters, clearAdvancedFilters } = useCustomerUrlState();
    const { tags } = useCustomerTags();

    // Local state to hold filter values before applying
    const [localLtvMin, setLocalLtvMin] = useState<string>(state.minLtv?.toString() || "");
    const [localLtvMax, setLocalLtvMax] = useState<string>(state.maxLtv?.toString() || "");
    const [localWithinDays, setLocalWithinDays] = useState<string>(state.lastOrderWithinDays?.toString() || "");
    const [localTagId, setLocalTagId] = useState<string | undefined>(state.tagId);

    if (!isOpen) return null;

    const handleApply = () => {
        setAdvancedFilters({
            minLtv: localLtvMin ? Number(localLtvMin) : undefined,
            maxLtv: localLtvMax ? Number(localLtvMax) : undefined,
            lastOrderWithinDays: localWithinDays ? Number(localWithinDays) : undefined,
            tagId: localTagId,
        });
        onClose();
    };

    const handleClear = () => {
        setLocalLtvMin("");
        setLocalLtvMax("");
        setLocalWithinDays("");
        setLocalTagId(undefined);
        clearAdvancedFilters();
        onClose();
    };

    const activeFilterCount = [
        state.minLtv,
        state.maxLtv,
        state.lastOrderWithinDays,
        state.tagId
    ].filter(v => v !== undefined).length;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex justify-end">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Drawer */}
                <motion.div
                    initial={{ x: "100%", opacity: 0.5 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "100%", opacity: 0.5 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="relative w-full max-w-sm h-full bg-[var(--card-bg)] shadow-2xl border-l border-[var(--card-border)] flex flex-col z-10"
                >
                    <div className="p-5 border-b border-[var(--card-border)] flex shadow-sm items-center justify-between bg-[var(--background)]">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[var(--ink)] text-white flex items-center justify-center">
                                <Filter className="w-4 h-4" />
                            </div>
                            <h2 className="font-bold text-foreground">Advanced Filters</h2>
                            {activeFilterCount > 0 && (
                                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center ml-2">
                                    {activeFilterCount}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 -mr-2 rounded-xl text-muted hover:text-foreground hover:bg-[var(--card-border)] transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 p-6 overflow-y-auto space-y-6">

                        {/* LTV Filter */}
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-emerald-500" />
                                Lifetime Value (IQD)
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <span className="text-xs text-muted mb-1 block uppercase tracking-wider font-semibold">Min</span>
                                    <input
                                        type="number"
                                        placeholder="0"
                                        value={localLtvMin}
                                        onChange={(e) => setLocalLtvMin(e.target.value)}
                                        className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink)] focus:border-transparent transition-all"
                                    />
                                </div>
                                <div>
                                    <span className="text-xs text-muted mb-1 block uppercase tracking-wider font-semibold">Max</span>
                                    <input
                                        type="number"
                                        placeholder="Any"
                                        value={localLtvMax}
                                        onChange={(e) => setLocalLtvMax(e.target.value)}
                                        className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink)] focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <hr className="border-[var(--card-border)]" />

                        {/* Recency Filter */}
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                Custom Recency
                            </label>
                            <div>
                                <span className="text-xs text-muted mb-1 block uppercase tracking-wider font-semibold">Days Since Last Order</span>
                                <select
                                    value={localWithinDays}
                                    onChange={(e) => setLocalWithinDays(e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink)] transition-all app-select"
                                >
                                    <option value="">Any time</option>
                                    <option value="7">Within last 7 days</option>
                                    <option value="30">Within last 30 days</option>
                                    <option value="90">Within last 90 days</option>
                                    <option value="365">Within last Year</option>
                                </select>
                            </div>
                        </div>

                        <hr className="border-[var(--card-border)]" />

                        {/* Customer Tags Component Picker */}
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                <TagIcon className="w-4 h-4 text-purple-500" />
                                Customer Has Tag
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setLocalTagId(undefined)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                                        !localTagId ? "bg-[var(--ink)] border-[var(--ink)] text-white" : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:border-[var(--foreground-muted)]"
                                    )}
                                >
                                    Any Tags
                                </button>
                                {tags.map(tag => {
                                    const isSelected = localTagId === tag.id;
                                    const colors = tagColorClasses[tag.color];
                                    return (
                                        <button
                                            key={tag.id}
                                            onClick={() => setLocalTagId(isSelected ? undefined : tag.id)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5",
                                                isSelected
                                                    ? `border-${colors.bg.split('-')[1]}-500 shadow-sm ring-2 ring-offset-1 ring-${colors.bg.split('-')[1]}-200`
                                                    : "border-transparent opacity-70 hover:opacity-100",
                                                colors.bg,
                                                colors.text
                                            )}
                                        >
                                            {tag.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                    </div>

                    <div className="p-5 border-t border-[var(--card-border)] bg-[var(--background)] flex gap-3">
                        <button
                            onClick={handleClear}
                            className="flex-1 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground-muted)] font-semibold rounded-xl hover:bg-[var(--card-border)] transition-colors"
                        >
                            Reset
                        </button>
                        <button
                            onClick={handleApply}
                            className="flex-1 py-3 bg-[var(--ink)] text-white font-semibold rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap px-4"
                        >
                            Apply Filters
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
