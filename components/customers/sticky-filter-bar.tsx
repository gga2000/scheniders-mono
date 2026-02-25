"use client";

import { motion } from "framer-motion";
import { Filter, Layers, ChevronDown, Crown, Star, User, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerStatus } from "@/lib/customer-types";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";

interface CustomerFilterState {
    status?: CustomerStatus | "all";
    search?: string;
    city?: string;
    governorate?: string;
    minLtv?: number;
    maxLtv?: number;
    lastOrderWithinDays?: number;
    tagId?: string;
    dormancyRisk?: 'active' | 'moderate' | 'at-risk' | 'dormant';
}

interface StickyCustomerFilterBarProps {
    filters: CustomerFilterState;
    setFilters: (filters: CustomerFilterState) => void;
    statusCounts: {
        all: number;
        vip: number;
        regular: number;
        new: number;
    };
    dormancyStats?: {
        active: number;        // Last order within 30 days
        moderate: number;      // 30-90 days
        at_risk: number;       // 90-180 days
        dormant: number;       // 180+ days
    };
    showFilters: boolean;
    setShowFilters: (show: boolean) => void;
    hasActiveFilters: boolean;
    groupBy?: 'none' | 'status' | 'city' | 'governorate';
    setGroupBy?: (group: 'none' | 'status' | 'city' | 'governorate') => void;
    className?: string;
    isMobile?: boolean;
}

export function StickyCustomerFilterBar({
    filters,
    setFilters,
    statusCounts,
    dormancyStats,
    showFilters,
    setShowFilters,
    hasActiveFilters,
    groupBy = 'none',
    setGroupBy,
    className,
    isMobile = false
}: StickyCustomerFilterBarProps) {
    const { t } = useLanguage();

    // Customer status filter options
    const statusOptions = [
        {
            id: "all",
            label: (t("customers.status.all") !== "customers.status.all" ? t("customers.status.all") : "All Customers"),
            count: statusCounts.all,
            icon: Users,
            color: "default"
        },
        {
            id: "vip",
            label: (t("customers.status.vip") !== "customers.status.vip" ? t("customers.status.vip") : "VIP"),
            count: statusCounts.vip || 0,
            icon: Crown,
            color: "amber"
        },
        {
            id: "regular",
            label: (t("customers.status.regular") !== "customers.status.regular" ? t("customers.status.regular") : "Regular"),
            count: statusCounts.regular || 0,
            icon: Star,
            color: "green"
        },
        {
            id: "new",
            label: (t("customers.status.new") !== "customers.status.new" ? t("customers.status.new") : "New"),
            count: statusCounts.new || 0,
            icon: User,
            color: "mint"
        },
    ];

    // Dormancy/Activity filter options
    const dormancyOptions = dormancyStats ? [
        {
            id: "active",
            label: "Active",
            count: dormancyStats.active,
            tooltip: "Ordered within 30 days",
            color: "green"
        },
        {
            id: "moderate",
            label: "Moderate",
            count: dormancyStats.moderate,
            tooltip: "Last order 30-90 days ago",
            color: "amber"
        },
        {
            id: "at-risk",
            label: "At Risk",
            count: dormancyStats.at_risk,
            tooltip: "Last order 90-180 days ago",
            color: "orange"
        },
        {
            id: "dormant",
            label: "Dormant",
            count: dormancyStats.dormant,
            tooltip: "Last order 180+ days ago",
            color: "rose"
        }
    ] : [];

    return (
        <div
            className={cn(
                "group/filters customers-sticky-filter transition-all duration-300 z-30",
                // Mobile Sticky Styles
                isMobile ? "sticky top-[78px] -mx-4 px-4 py-2 backdrop-blur-xl bg-background/80 border-b border-white/10 shadow-sm" : "",
                className
            )}
        >
            <div className={cn(
                "flex items-center gap-2 overflow-x-auto scrollbar-hide snap-x py-6 px-6",
                // Mobile adjustments for touch targets
                isMobile ? "min-h-[50px]" : ""
            )}>
                {/* Customer Status Pills */}
                {statusOptions.map((option) => {
                    const Icon = option.icon;
                    const isActive = filters.status === option.id || (option.id === "all" && !filters.status);

                    return (
                        <button
                            key={option.id}
                            onClick={() => setFilters({
                                ...filters,
                                status: option.id === "all" ? undefined : option.id as CustomerStatus
                            })}
                            className={cn(
                                "rounded-full whitespace-nowrap transition-all flex items-center gap-2 snap-start flex-shrink-0 border",
                                // Mobile: Larger touch targets (48px min height)
                                isMobile
                                    ? "min-h-[48px] px-5 py-3 text-sm font-semibold"
                                    : "px-4 py-2 text-sm font-medium",

                                isActive
                                    ? cn(
                                        "font-bold shadow-sm scale-105",
                                        option.color === "default" && "bg-[var(--primary)] text-[var(--primary-fg)] border-[var(--primary)]",
                                        option.color === "amber" && "bg-[var(--pastel-yellow)] text-amber-900 border-amber-200",
                                        option.color === "green" && "bg-[var(--pastel-green)] text-green-900 border-green-200",
                                        option.color === "mint" && "bg-[var(--pastel-mint)] text-teal-900 border-teal-200"
                                    )
                                    : "bg-background text-muted-foreground border-border/50 hover:bg-muted hover:border-border hover:text-foreground active:scale-95 dark:bg-[#1E1E1E] dark:text-[#A1A1A1] dark:border-[#3F3F3F] dark:hover:border-[rgba(0,255,255,0.4)] dark:hover:text-white dark:hover:bg-[#242424]"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            <span>{option.label}</span>
                            <span className={cn(
                                "px-2 py-0.5 rounded-full text-[11px] font-bold min-w-[24px] text-center",
                                isActive
                                    ? "bg-background/20 text-current"
                                    : "bg-muted-foreground/10 text-muted-foreground group-hover/filters:bg-muted-foreground/20"
                            )}>
                                {option.count}
                            </span>
                        </button>
                    );
                })}

                {/* Dormancy Pills (if stats available) */}
                {dormancyOptions.length > 0 && (
                    <>
                        {/* Vertical Divider */}
                        <div className="w-px h-8 bg-border flex-shrink-0 mx-1" />

                        {dormancyOptions.map((option) => {
                            const isActive = filters.dormancyRisk === option.id;

                            return (
                                <button
                                    key={option.id}
                                    onClick={() => setFilters({
                                        ...filters,
                                        dormancyRisk: isActive ? undefined : option.id as CustomerFilterState['dormancyRisk']
                                    })}
                                    title={option.tooltip}
                                    className={cn(
                                        "rounded-full whitespace-nowrap transition-all flex items-center gap-2 snap-start flex-shrink-0 border",
                                        isMobile ? "min-h-[48px] px-5 py-3 text-sm" : "px-4 py-2 text-sm font-medium",

                                        isActive
                                            ? cn(
                                                "font-bold scale-105 shadow-sm",
                                                option.color === "green" && "bg-green-100 text-green-700 border-green-200",
                                                option.color === "amber" && "bg-amber-100 text-amber-700 border-amber-200",
                                                option.color === "orange" && "bg-orange-100 text-orange-700 border-orange-200",
                                                option.color === "rose" && "bg-rose-100 text-rose-700 border-rose-200"
                                            )
                                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                                    )}
                                >
                                    {option.id === "at-risk" || option.id === "dormant" ? (
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                    ) : null}
                                    <span>{option.label}</span>
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[11px] font-bold min-w-[24px] text-center",
                                        isActive
                                            ? "bg-background/20 text-current"
                                            : "bg-muted-foreground/10 text-muted-foreground"
                                    )}>
                                        {option.count}
                                    </span>
                                </button>
                            );
                        })}
                    </>
                )}

                {/* Vertical Divider */}
                <div className="w-px h-8 bg-border flex-shrink-0 mx-1" />

                {/* Advanced Filters Toggle */}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                        "rounded-full whitespace-nowrap transition-all flex items-center gap-2 flex-shrink-0 border",
                        isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                        showFilters || hasActiveFilters
                            ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-400/15 dark:text-blue-200 dark:border-blue-400/35"
                            : "bg-background text-muted-foreground border-border/50 hover:bg-muted dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                    )}
                >
                    <Filter className="w-4 h-4" />
                    {!isMobile && (t("customers.toolbar.filter") !== "customers.toolbar.filter" ? t("customers.toolbar.filter") : "Filters")}
                    {hasActiveFilters && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                </button>

                {/* Grouping Toggle (Optional) */}
                {setGroupBy && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                                    isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                                    groupBy !== 'none'
                                        ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-400/15 dark:text-purple-200 dark:border-purple-400/35"
                                        : "bg-background text-muted-foreground border-border/50 hover:bg-muted dark:hover:bg-white/5 dark:hover:border-[#4a5f87]"
                                )}
                            >
                                <Layers className="w-4 h-4" />
                                {!isMobile && `${t("common.group") !== "common.group" ? t("common.group") : "Group"}: ${groupBy === 'none' ? (t("common.none") !== "common.none" ? t("common.none") : "None") :
                                    groupBy === 'status' ? 'Status' :
                                        groupBy === 'city' ? 'City' :
                                            groupBy === 'governorate' ? 'Governorate' : groupBy
                                    }`}
                                {isMobile && groupBy !== 'none' && groupBy}
                                <ChevronDown className="w-3 h-3 opacity-50" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => setGroupBy('none')}>
                                {t("common.none") || "None"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setGroupBy('status')}>
                                {t("common.status") || "Status"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setGroupBy('city')}>
                                {t("common.city") || "City"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setGroupBy('governorate')}>
                                {t("common.governorate") || "Governorate"}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    );
}
