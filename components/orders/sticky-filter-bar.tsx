"use client";

import { motion } from "framer-motion";
import { Filter, Layers, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Order, OrderStatus, OrderPriority } from "@/lib/supabase";

interface FilterState {
    status?: OrderStatus | "all";
    searchQuery?: string;
    dateFrom?: string;
    dateTo?: string;
    city?: string;
    product?: string;
    priority?: OrderPriority;
}

interface StickyFilterBarProps {
    filters: FilterState;
    setFilters: (filters: FilterState) => void;
    statusCounts: Record<string, number>;
    showFilters: boolean;
    setShowFilters: (show: boolean) => void;
    hasActiveFilters: boolean;
    groupBy: 'none' | 'status' | 'city' | 'verified';
    setGroupBy: (group: 'none' | 'status' | 'city' | 'verified') => void;
    className?: string;
    isMobile?: boolean;
}

export function StickyFilterBar({
    filters,
    setFilters,
    statusCounts,
    showFilters,
    setShowFilters,
    hasActiveFilters,
    groupBy,
    setGroupBy,
    className,
    isMobile = false
}: StickyFilterBarProps) {

    const filterOptions = [
        { id: "all", label: "All", fullLabel: "All Orders", count: statusCounts.all },
        { id: "new", label: "New", count: statusCounts.new || 0 },
        { id: "contacted", label: "Contacted", count: statusCounts.contacted || 0 },
        { id: "confirmed", label: "Confirmed", count: statusCounts.confirmed || 0 },
        { id: "in_transit", label: "In Transit", count: statusCounts.in_transit || 0 },
        { id: "delivered", label: "Delivered", count: statusCounts.delivered || 0 },
        { id: "completed", label: "Completed", count: statusCounts.completed || 0 },
        { id: "rejected", label: "Rejected", count: statusCounts.rejected || 0 },
        { id: "no_response", label: "No Response", count: statusCounts.no_response || 0 },
    ];

    return (
        <div
            className={cn(
                "group/filters transition-all duration-300 z-30",
                // Mobile Sticky Styles
                isMobile ? "sticky top-[78px] -mx-4 px-4 py-2 backdrop-blur-xl bg-background/80 border-b border-white/10 shadow-sm" : "",
                className
            )}
        >
            <div className={cn(
                "flex items-center gap-2 overflow-x-auto scrollbar-hide snap-x py-1",
                // Mobile adjustments for touch targets
                isMobile ? "min-h-[50px]" : ""
            )}>
                {/* Status Pills */}
                {filterOptions.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => setFilters({ ...filters, status: option.id === "all" ? undefined : option.id as Order["status"] })}
                        className={cn(
                            "rounded-full whitespace-nowrap transition-all flex items-center gap-2 snap-start flex-shrink-0 border",
                            // Mobile: Larger touch targets (44px min height recommended, using py-2.5)
                            isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",

                            filters.status === option.id || (option.id === "all" && !filters.status)
                                ? "bg-foreground text-background border-foreground shadow-md scale-105"
                                : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground"
                        )}
                    >
                        <span>{isMobile ? option.label : (option.fullLabel || option.label)}</span>
                        <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px] text-center",
                            filters.status === option.id || (option.id === "all" && !filters.status)
                                ? "bg-background/20 text-current"
                                : "bg-muted text-muted-foreground"
                        )}>
                            {option.count}
                        </span>
                    </button>
                ))}

                {/* Vertical Divider */}
                <div className="w-px h-8 bg-border flex-shrink-0 mx-1" />

                {/* Filters Toggle */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                        "rounded-full whitespace-nowrap transition-all flex items-center gap-2 flex-shrink-0 border",
                        isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                        showFilters || hasActiveFilters
                            ? "bg-blue-100 text-blue-700 border-blue-200"
                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted"
                    )}
                >
                    <Filter className="w-4 h-4" />
                    {!isMobile && "Filters"}
                    {hasActiveFilters && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                </button>

                {/* Grouping Toggle */}
                <div className="relative group/dropdown flex-shrink-0">
                    <button
                        className={cn(
                            "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                            isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                            groupBy !== 'none'
                                ? "bg-purple-100 text-purple-700 border-purple-200"
                                : "bg-background text-muted-foreground border-border/50 hover:bg-muted"
                        )}
                    >
                        <Layers className="w-4 h-4" />
                        {!isMobile && `Group: ${groupBy === 'none' ? 'None' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`}
                        {isMobile && groupBy !== 'none' && (groupBy.charAt(0).toUpperCase() + groupBy.slice(1))}
                        <ChevronDown className="w-3 h-3 opacity-50" />
                    </button>

                    {/* Simple Dropdown using native select for mobile to avoid portal issues, or custom for consistency? 
                        Let's keep the custom one but ensure z-index. 
                        Actually, for mobile, a native select overlaid purely for functionality is often robust.
                        But to match the design, let's Stick to the existing pattern but careful with z-index.
                    */}
                    <div className="absolute top-full right-0 mt-2 w-48 bg-background rounded-xl shadow-xl border border-border p-1 z-50 hidden group-hover/dropdown:block">
                        <button onClick={() => setGroupBy('none')} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted text-foreground">None</button>
                        <button onClick={() => setGroupBy('status')} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted text-foreground">Status</button>
                        <button onClick={() => setGroupBy('city')} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted text-foreground">City</button>
                        <button onClick={() => setGroupBy('verified')} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted text-foreground">Verified</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
