"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    AlertTriangle,
    X,
    Clock,
    ChevronDown,
    ChevronUp,
    UserX,
    Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";

interface CustomerHealthAlertsProps {
    customers: PaginatedCustomer[];
    onViewCustomer?: (phone: string) => void;
}

type Severity = "critical" | "warning" | "info";

interface CustomerChipData {
    phone: string;
    name: string;
    detail: string;
}

interface SeverityGroup {
    severity: Severity;
    customers: CustomerChipData[];
    icon: React.ElementType;
    bgGradient: string;
    iconBg: string;
    iconColor: string;
    textColor: string;
    badgeColor: string;
    chipBg: string;
    chipText: string;
    chipHover: string;
    title: string;
    description: string;
    severityLabel: string;
}

const PREVIEW_LIMIT = 5;

function daysSince(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function CustomerHealthAlerts({
    customers,
    onViewCustomer,
}: CustomerHealthAlertsProps) {
    const { t, language } = useLanguage();
    const [dismissedSeverities, setDismissedSeverities] = useState<Set<Severity>>(
        new Set()
    );
    const [snoozedUntil, setSnoozedUntil] = useState<Record<Severity, number | null>>({
        critical: null,
        warning: null,
        info: null,
    });
    const [expanded, setExpanded] = useState(false);

    const isSnoozed = (severity: Severity): boolean => {
        const until = snoozedUntil[severity];
        return until !== null && Date.now() < until;
    };

    const severityGroups = useMemo(() => {
        const churning: CustomerChipData[] = [];
        const trustDrops: CustomerChipData[] = [];

        for (const customer of customers) {
            const daysSinceLastOrder = customer.last_order_date
                ? daysSince(customer.last_order_date)
                : Infinity;

            if (daysSinceLastOrder >= 60 && customer.trust_score < 40) {
                churning.push({
                    phone: customer.phone,
                    name: customer.name,
                    detail: `${daysSinceLastOrder}d ago`,
                });
            }

            if (
                customer.trust_tier === "watch" ||
                customer.trust_tier === "risky"
            ) {
                trustDrops.push({
                    phone: customer.phone,
                    name: customer.name,
                    detail: `${customer.trust_score}`,
                });
            }
        }

        churning.sort((a, b) => parseInt(b.detail) - parseInt(a.detail));
        trustDrops.sort((a, b) => parseInt(a.detail) - parseInt(b.detail));

        const groups: SeverityGroup[] = [];

        if (churning.length > 0) {
            groups.push({
                severity: "critical",
                customers: churning,
                icon: UserX,
                bgGradient:
                    "from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/30",
                iconBg: "bg-rose-100 dark:bg-rose-900/50",
                iconColor: "text-rose-600 dark:text-rose-400",
                textColor: "text-rose-900 dark:text-rose-100",
                badgeColor: "bg-rose-500",
                chipBg: "bg-rose-100 dark:bg-rose-900/40",
                chipText: "text-rose-700 dark:text-rose-300",
                chipHover: "hover:bg-rose-200 dark:hover:bg-rose-800/50",
                title: `${churning.length} customers at risk of churning`,
                description: "No orders in 60+ days with declining trust",
                severityLabel: "CRITICAL",
            });
        }

        if (trustDrops.length > 0) {
            groups.push({
                severity: "warning",
                customers: trustDrops,
                icon: Eye,
                bgGradient:
                    "from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30",
                iconBg: "bg-amber-100 dark:bg-amber-900/50",
                iconColor: "text-amber-600 dark:text-amber-400",
                textColor: "text-amber-900 dark:text-amber-100",
                badgeColor: "bg-amber-500",
                chipBg: "bg-amber-100 dark:bg-amber-900/40",
                chipText: "text-amber-700 dark:text-amber-300",
                chipHover: "hover:bg-amber-200 dark:hover:bg-amber-800/50",
                title: `${trustDrops.length} customers under watch`,
                description: "Trust score requires monitoring",
                severityLabel: "WARNING",
            });
        }

        return groups;
    }, [customers]);

    // Filter out snoozed and dismissed severity groups
    const visibleGroups = severityGroups.filter(
        (g) => !isSnoozed(g.severity) && !dismissedSeverities.has(g.severity)
    );

    if (visibleGroups.length === 0) return null;

    const handleSnooze = (severity: Severity) => {
        setSnoozedUntil((prev) => ({
            ...prev,
            [severity]: Date.now() + 24 * 60 * 60 * 1000,
        }));
    };

    const handleDismiss = (severity: Severity) => {
        setDismissedSeverities((prev) => {
            const next = new Set(prev);
            next.add(severity);
            return next;
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2 mb-6"
        >
            <AnimatePresence mode="popLayout">
                {visibleGroups.map((group) => {
                    const isExpanded = expanded;
                    const displayCustomers = isExpanded
                        ? group.customers
                        : group.customers.slice(0, PREVIEW_LIMIT);
                    const hasMore = group.customers.length > PREVIEW_LIMIT;

                    const Icon = group.icon;

                    return (
                        <motion.div
                            key={group.severity}
                            layout
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="relative overflow-hidden rounded-2xl"
                        >
                            <div
                                className={cn(
                                    "absolute inset-0 bg-gradient-to-r",
                                    group.bgGradient
                                )}
                            />

                            <div className="relative p-4">
                                {/* Header */}
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                                            group.iconBg
                                        )}
                                    >
                                        <Icon
                                            className={cn("w-5 h-5", group.iconColor)}
                                        />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white",
                                                    group.badgeColor
                                                )}
                                            >
                                                {group.severityLabel}
                                            </span>
                                            <h3
                                                className={cn(
                                                    "text-sm font-semibold",
                                                    group.textColor
                                                )}
                                            >
                                                {group.title}
                                            </h3>
                                        </div>

                                        <p
                                            className={cn(
                                                "text-xs mt-0.5 opacity-70",
                                                group.textColor
                                            )}
                                        >
                                            {group.description}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => handleSnooze(group.severity)}
                                            className={cn(
                                                "inline-flex items-center justify-center gap-1 px-2.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] min-w-[44px]",
                                                group.chipBg,
                                                group.chipText,
                                                group.chipHover
                                            )}
                                            title="Snooze 24h"
                                        >
                                            <Clock className="w-3 h-3" />
                                            <span className="hidden sm:inline">
                                                Snooze 24h
                                            </span>
                                        </button>
                                        <button
                                            onClick={() =>
                                                handleDismiss(group.severity)
                                            }
                                            className={cn(
                                                "inline-flex items-center justify-center rounded-lg transition-colors min-h-[44px] min-w-[44px]",
                                                group.chipHover
                                            )}
                                            title="Dismiss"
                                            aria-label="Dismiss alert"
                                        >
                                            <X
                                                className={cn(
                                                    "w-4 h-4",
                                                    group.iconColor
                                                )}
                                            />
                                        </button>
                                    </div>
                                </div>

                                {/* Customer chips */}
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {displayCustomers.map((customer) => (
                                        <button
                                            key={customer.phone}
                                            onClick={() =>
                                                onViewCustomer?.(customer.phone)
                                            }
                                            className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                group.chipBg,
                                                group.chipText,
                                                group.chipHover
                                            )}
                                        >
                                            <span className="truncate max-w-[120px]">
                                                {customer.name}
                                            </span>
                                            <span className="opacity-60 text-[10px] flex items-center gap-0.5">
                                                ({customer.detail})
                                            </span>
                                        </button>
                                    ))}

                                    {hasMore && !isExpanded && (
                                        <button
                                            onClick={() => setExpanded(true)}
                                            className={cn(
                                                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                                group.chipBg,
                                                group.chipText,
                                                group.chipHover
                                            )}
                                        >
                                            +{group.customers.length - PREVIEW_LIMIT}{" "}
                                            more
                                            <ChevronDown className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>

                                {/* Collapse button when expanded */}
                                {isExpanded && hasMore && (
                                    <button
                                        onClick={() => setExpanded(false)}
                                        className={cn(
                                            "flex items-center gap-1 mt-2 text-xs font-medium transition-colors",
                                            group.chipText,
                                            "opacity-70 hover:opacity-100"
                                        )}
                                    >
                                        <ChevronUp className="w-3 h-3" />
                                        Show less
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </motion.div>
    );
}
