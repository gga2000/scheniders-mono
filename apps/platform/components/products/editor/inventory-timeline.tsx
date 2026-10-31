"use client";

import { useState } from "react";
import {
    History,
    PackagePlus,
    ShoppingCart,
    RotateCcw,
    SlidersHorizontal,
    Lock,
    AlertTriangle,
    ClipboardCheck,
    PackageOpen,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export interface InventoryHistoryFormData {
    change_type: (typeof HISTORY_TYPES)[number];
    quantity_change: number;
    quantity_before: number;
    quantity_after: number;
    reference_id?: string;
    notes?: string;
    changed_by?: string;
    created_at?: string;
}

interface InventoryTimelineProps {
    entries: InventoryHistoryFormData[];
}

/** Entry types the log holds for sales and stock movements. */
const CHANGE_TYPES = ["received", "sold", "returned", "adjusted", "reserved", "quarantined"] as const;
/** Every type the log holds: shelf counts are written by the stock count RPCs. */
const HISTORY_TYPES = [...CHANGE_TYPES, "count", "open_box_count"] as const;


const TYPE_CONFIG: Record<
    InventoryHistoryFormData["change_type"],
    {
        icon: typeof History;
        bgClass: string;
        textClass: string;
        badgeBg: string;
        badgeText: string;
    }
> = {
    received: {
        icon: PackagePlus,
        bgClass: "bg-[var(--pastel-green)]",
        textClass: "text-green-700",
        badgeBg: "bg-[var(--pastel-green)]",
        badgeText: "text-green-700",
    },
    sold: {
        icon: ShoppingCart,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700",
        badgeBg: "bg-[var(--pastel-blue)]",
        badgeText: "text-blue-700",
    },
    returned: {
        icon: RotateCcw,
        bgClass: "bg-[var(--pastel-yellow)]",
        textClass: "text-yellow-700",
        badgeBg: "bg-[var(--pastel-yellow)]",
        badgeText: "text-yellow-700",
    },
    adjusted: {
        icon: SlidersHorizontal,
        bgClass: "bg-[var(--pastel-pink)]",
        textClass: "text-pink-700",
        badgeBg: "bg-[var(--pastel-pink)]",
        badgeText: "text-pink-700",
    },
    reserved: {
        icon: Lock,
        bgClass: "bg-[var(--pastel-mint)]",
        textClass: "text-teal-700",
        badgeBg: "bg-[var(--pastel-mint)]",
        badgeText: "text-teal-700",
    },
    quarantined: {
        icon: AlertTriangle,
        bgClass: "bg-rose-100",
        textClass: "text-rose-700",
        badgeBg: "bg-rose-100",
        badgeText: "text-rose-700",
    },
    count: {
        icon: ClipboardCheck,
        bgClass: "bg-[var(--pastel-blue)]",
        textClass: "text-blue-700",
        badgeBg: "bg-[var(--pastel-blue)]",
        badgeText: "text-blue-700",
    },
    open_box_count: {
        icon: PackageOpen,
        bgClass: "bg-[var(--pastel-yellow)]",
        textClass: "text-yellow-700",
        badgeBg: "bg-[var(--pastel-yellow)]",
        badgeText: "text-yellow-700",
    },
};

function formatDate(dateStr?: string): string {
    if (!dateStr) return "";
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return dateStr;
    }
}

function formatQuantityChange(value: number): { text: string; colorClass: string } {
    if (value >= 0) {
        return { text: `+${value}`, colorClass: "text-green-600" };
    }
    return { text: `${value}`, colorClass: "text-red-600" };
}

export function InventoryTimeline({ entries }: InventoryTimelineProps) {
    const { t } = useLanguage();
    const [filter, setFilter] = useState<InventoryHistoryFormData["change_type"] | "all">("all");
    const typeLabel = (type: string) => t(`products.ed.inv.type.${type}`);

    const filteredEntries =
        filter === "all" ? entries : entries.filter((e) => e.change_type === filter);

    const typeCounts: Record<string, number> = { all: entries.length };
    for (const type of HISTORY_TYPES) {
        typeCounts[type] = entries.filter((e) => e.change_type === type).length;
    }

    return (
        <div className="space-y-5">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-1.5">
                {(["all", ...HISTORY_TYPES] as const).map((type) => {
                    const isActive = filter === type;
                    const count = typeCounts[type] ?? 0;
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setFilter(type)}
                            className={
                                isActive
                                    ? "px-3 py-1.5 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-medium"
                                    : "px-3 py-1.5 text-muted hover:text-foreground rounded-lg text-sm transition-colors"
                            }
                        >
                            {type === "all" ? t("products.ed.inv.all") : typeLabel(type)}
                            <span className="ml-1.5 text-xs opacity-70">{count}</span>
                        </button>
                    );
                })}
            </div>

            {/* Empty state */}
            {entries.length === 0 && (
                <p className="text-sm text-muted py-4 text-center">
                    {t("products.ed.inv.empty")}
                </p>
            )}

            {/* Timeline */}
            {filteredEntries.length > 0 && (
                <div className="relative pl-8 before:absolute before:left-3 before:top-0 before:bottom-0 before:w-0.5 before:bg-[var(--card-border)]">
                    <div className="space-y-4">
                        {filteredEntries.map((entry, idx) => {
                            const config = TYPE_CONFIG[entry.change_type];
                            const Icon = config.icon;
                            const qty = formatQuantityChange(entry.quantity_change);

                            return (
                                <div key={idx} className="relative">
                                    {/* Timeline node circle */}
                                    <div
                                        className={`absolute left-0 w-7 h-7 rounded-full flex items-center justify-center -translate-x-[calc(100%+0.25rem)] ${config.bgClass}`}
                                        style={{ left: "-0.5rem" }}
                                    >
                                        <Icon className={`w-3.5 h-3.5 ${config.textClass}`} />
                                    </div>

                                    {/* Content card */}
                                    <div className="ml-2 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)] relative group">
                                        {/* Top row */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.badgeBg} ${config.badgeText}`}
                                            >
                                                {typeLabel(entry.change_type)}
                                            </span>
                                            <span className={`font-mono font-bold text-sm ${qty.colorClass}`}>
                                                {qty.text}
                                            </span>
                                            {entry.created_at && (
                                                <span className="text-xs text-muted ml-auto">
                                                    {formatDate(entry.created_at)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Before -> After */}
                                        <p className="text-sm text-muted mt-1">
                                            {t("products.ed.inv.beforeAfter").replace("{before}", String(entry.quantity_before)).replace("{after}", String(entry.quantity_after))}
                                        </p>

                                        {/* Bottom details */}
                                        {(entry.notes || entry.changed_by || entry.reference_id) && (
                                            <div className="flex items-center gap-2 flex-wrap mt-1.5">
                                                {entry.notes && (
                                                    <span className="text-sm text-muted italic">
                                                        {entry.notes}
                                                    </span>
                                                )}
                                                {entry.changed_by && (
                                                    <span className="px-2 py-0.5 bg-[var(--card-border)] rounded-full text-xs text-muted">
                                                        {entry.changed_by}
                                                    </span>
                                                )}
                                                {entry.reference_id && (
                                                    <span className="text-xs text-blue-600 underline underline-offset-2 cursor-pointer">
                                                        {entry.reference_id}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Filtered empty state */}
            {filteredEntries.length === 0 && entries.length > 0 && (
                <p className="text-sm text-muted py-4 text-center">
                    {t("products.ed.inv.noMatch")}
                </p>
            )}
        </div>
    );
}
