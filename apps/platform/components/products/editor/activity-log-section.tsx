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
import { useLanguage } from "@/hooks/use-language";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useCategoriesQuery } from "@/hooks/use-categories-query";
import { formatCount } from "@/lib/utils";

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
    changes_json?: Record<string, { before: unknown; after: unknown }> | null;
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
    }
> = {
    created: {
        icon: Zap,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700 dark:text-green-300",
    },
    updated: {
        icon: Edit,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700 dark:text-blue-300",
    },
    status_changed: {
        icon: Archive,
        bgClass: "bg-[var(--pastel-yellow)]",
        textClass: "text-yellow-700 dark:text-yellow-300",
    },
    price_changed: {
        icon: DollarSign,
        bgClass: "bg-[var(--pastel-pink)]",
        textClass: "text-pink-700 dark:text-pink-300",
    },
    image_added: {
        icon: Image,
        bgClass: "bg-[var(--pastel-mint)]",
        textClass: "text-teal-700 dark:text-teal-300",
    },
    variant_added: {
        icon: Package,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700 dark:text-green-300",
    },
    variant_removed: {
        icon: Package,
        bgClass: "bg-[var(--pastel-pink)]",
        textClass: "text-pink-700 dark:text-pink-300",
    },
    inventory_adjusted: {
        icon: Box,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700 dark:text-blue-300",
    },
    published: {
        icon: Zap,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700 dark:text-green-300",
    },
    archived: {
        icon: Archive,
        bgClass: "bg-[var(--muted)]/20",
        textClass: "text-muted",
    },
};

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86_400],
    ["month", 30 * 86_400],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
];

/** "3 hours ago" / "قبل ٣ ساعات", in the merchant's language. */
export function relativeTime(iso: string, language: string, now: number = Date.now()): string {
    const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
    const format = new Intl.RelativeTimeFormat(language === "ar" ? "ar" : "en", { numeric: "auto" });
    for (const [unit, size] of RELATIVE_STEPS) {
        if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
    }
    return format.format(0, "second");
}

const MONEY_FIELDS = new Set(["price", "compare_at_price"]);

const INITIAL_LIMIT = 10;

export function ActivityLogSection({ entries }: ActivityLogSectionProps) {
    const { t, language } = useLanguage();
    const { data: members } = useTenantMembers();
    const { data: categories } = useCategoriesQuery();
    const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
    const [showAll, setShowAll] = useState(false);

    const visibleEntries = showAll ? entries : entries.slice(0, INITIAL_LIMIT);
    const hasMore = entries.length > INITIAL_LIMIT;

    const memberName = (userId: string) =>
        members?.find((m) => m.user_id === userId)?.display_name ?? t("products.activity.teamMember");

    const formatValue = (field: string, value: unknown): string => {
        if (value === null || value === undefined || value === "") return "\u2014";
        if (typeof value === "boolean") return value ? t("common.yes") : t("common.no");
        if (MONEY_FIELDS.has(field) && typeof value === "number") return `${formatCount(value)} IQD`;
        if (field === "status" && typeof value === "string") return t(`products.activity.status.${value}`);
        if (field === "category_id" && typeof value === "string") {
            return categories?.find((c) => c.id === value)?.name ?? t("products.activity.otherCategory");
        }
        if (field === "image_url") return t("products.activity.image");
        return String(value);
    };

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
                    {t("products.activity.empty")}
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
                                                {t(`products.activity.action.${entry.action}`)}
                                            </span>
                                            <span className="text-xs text-muted ms-auto">
                                                {relativeTime(entry.created_at, language)}
                                            </span>
                                        </div>

                                        {/* User */}
                                        {entry.user_id && (
                                            <p className="text-xs text-muted mt-0.5">
                                                {t("products.activity.by", { name: memberName(entry.user_id) })}
                                            </p>
                                        )}

                                        {/* Expandable diff toggle */}
                                        {hasDiff && (
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(idx)}
                                                className="flex items-center gap-1 mt-2 text-xs font-medium text-foreground hover:opacity-70 transition-opacity"
                                            >
                                                {isExpanded ? (
                                                    <>
                                                        <ChevronUp className="w-3.5 h-3.5" />
                                                        {t("products.activity.hide")}
                                                    </>
                                                ) : (
                                                    <>
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                        {t("products.activity.show")}
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
                                                                        {t(`products.activity.field.${field}`)}
                                                                    </span>
                                                                    <span className="text-rose-600 line-through dark:text-rose-300">
                                                                        {formatValue(field, change.before)}
                                                                    </span>
                                                                    <span className="text-muted">&rarr;</span>
                                                                    <span className="text-green-700 font-medium dark:text-green-300">
                                                                        {formatValue(field, change.after)}
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
                                {t("products.activity.less")}
                            </>
                        ) : (
                            <>
                                <ChevronDown className="w-4 h-4" />
                                {t("products.activity.more", { count: formatCount(entries.length - INITIAL_LIMIT) })}
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
