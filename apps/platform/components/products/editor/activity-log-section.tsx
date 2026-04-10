"use client";

import { useState } from "react";
import {
    Edit,
    DollarSign,
    Image,
    Box,
    Package,
    Archive,
    Zap,
    ChevronDown,
    ChevronUp,
    Clock,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface ActivityLogEntry {
    id?: string;
    action:
        | "created"
        | "updated"
        | "status_changed"
        | "price_changed"
        | "image_added"
        | "variant_added"
        | "variant_removed"
        | "inventory_adjusted"
        | "published"
        | "archived";
    changes_json?: Record<string, { before: any; after: any }> | null;
    user_id?: string | null;
    created_at: string;
}

interface ActivityLogSectionProps {
    entries: ActivityLogEntry[];
}

const ACTION_CONFIG: Record<
    ActivityLogEntry["action"],
    {
        icon: typeof Clock;
        bgClass: string;
        textClass: string;
        label: string;
    }
> = {
    created: {
        icon: Zap,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700",
        label: "Product Created",
    },
    updated: {
        icon: Edit,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700",
        label: "Product Updated",
    },
    status_changed: {
        icon: Archive,
        bgClass: "bg-[var(--pastel-yellow)]",
        textClass: "text-yellow-700",
        label: "Status Changed",
    },
    price_changed: {
        icon: DollarSign,
        bgClass: "bg-[var(--pastel-pink)]",
        textClass: "text-pink-700",
        label: "Price Changed",
    },
    image_added: {
        icon: Image,
        bgClass: "bg-[var(--pastel-mint)]",
        textClass: "text-teal-700",
        label: "Image Added",
    },
    variant_added: {
        icon: Package,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700",
        label: "Variant Added",
    },
    variant_removed: {
        icon: Package,
        bgClass: "bg-[var(--pastel-pink)]",
        textClass: "text-pink-700",
        label: "Variant Removed",
    },
    inventory_adjusted: {
        icon: Box,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700",
        label: "Inventory Adjusted",
    },
    published: {
        icon: Zap,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700",
        label: "Published",
    },
    archived: {
        icon: Archive,
        bgClass: "bg-[var(--muted)]/20",
        textClass: "text-[var(--muted)]",
        label: "Archived",
    },
};

function relativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;

    if (diffMs < 0) return "just now";

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}

function formatFieldName(field: string): string {
    return field
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val: any): string {
    if (val === null || val === undefined) return "\u2014";
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
}

const INITIAL_LIMIT = 10;

export function ActivityLogSection({ entries }: ActivityLogSectionProps) {
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [showAll, setShowAll] = useState(false);

    const visibleEntries = showAll ? entries : entries.slice(0, INITIAL_LIMIT);
    const hasMore = entries.length > INITIAL_LIMIT;

    function toggleExpanded(idx: number) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    }

    return (
        <div className="space-y-5">
            {entries.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">
                    No activity recorded yet
                </p>
            ) : (
                <div className="relative pl-8 before:absolute before:left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-[var(--card-border)]">
                    <div className="space-y-4">
                        {visibleEntries.map((entry, idx) => {
                            const config = ACTION_CONFIG[entry.action];
                            const Icon = config.icon;
                            const isExpanded = expandedIds.has(idx);
                            const hasDiff =
                                entry.changes_json &&
                                Object.keys(entry.changes_json).length > 0;

                            return (
                                <div key={entry.id ?? idx} className="relative">
                                    {/* Timeline node circle */}
                                    <div
                                        className={`absolute w-7 h-7 rounded-full flex items-center justify-center ${config.bgClass}`}
                                        style={{ left: "-1.75rem", top: "0.25rem" }}
                                    >
                                        <Icon className={`w-3.5 h-3.5 ${config.textClass}`} />
                                    </div>

                                    {/* Content card */}
                                    <div className="ml-2 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
                                        {/* Top row */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium text-foreground">
                                                {config.label}
                                            </span>
                                            <span className="text-xs text-muted ml-auto">
                                                {relativeTime(entry.created_at)}
                                            </span>
                                        </div>

                                        {/* User */}
                                        {entry.user_id && (
                                            <p className="text-xs text-muted mt-0.5">
                                                By: {entry.user_id}
                                            </p>
                                        )}

                                        {/* Expandable diff toggle */}
                                        {hasDiff && (
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(idx)}
                                                className="flex items-center gap-1 mt-2 text-xs font-medium text-[var(--ink)] hover:opacity-70 transition-opacity"
                                            >
                                                {isExpanded ? (
                                                    <>
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                        Hide changes
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                        Show changes
                                                    </>
                                                )}
                                            </button>
                                        )}

                                        {/* Diff view */}
                                        <AnimatePresence initial={false}>
                                            {isExpanded && hasDiff && entry.changes_json && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2, ease: "easeInOut" }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="mt-2 space-y-1.5 border-t border-[var(--card-border)] pt-2">
                                                        {Object.entries(entry.changes_json).map(
                                                            ([field, change]) => (
                                                                <div
                                                                    key={field}
                                                                    className="flex items-start gap-2 text-xs"
                                                                >
                                                                    <span className="font-medium text-foreground min-w-[80px] shrink-0">
                                                                        {formatFieldName(field)}
                                                                    </span>
                                                                    <span className="text-rose-600 line-through">
                                                                        {formatValue(change.before)}
                                                                    </span>
                                                                    <span className="text-muted">&rarr;</span>
                                                                    <span className="text-green-700 font-medium">
                                                                        {formatValue(change.after)}
                                                                    </span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Show more / Show less */}
            {hasMore && (
                <div className="text-center pt-1">
                    <button
                        type="button"
                        onClick={() => setShowAll((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
                    >
                        {showAll ? (
                            <>
                                <ChevronUp className="w-4 h-4" />
                                Show less
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-4 h-4" />
                                Show more ({entries.length - INITIAL_LIMIT} remaining)
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
