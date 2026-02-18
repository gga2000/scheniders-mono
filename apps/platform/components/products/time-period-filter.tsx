"use client";

import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

export type TimePeriod = "today" | "week" | "month" | "all";

interface TimePeriodFilterProps {
    value: TimePeriod;
    onChange: (period: TimePeriod) => void;
}

const periods: { value: TimePeriod; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "all", label: "All Time" },
];

export function TimePeriodFilter({ value, onChange }: TimePeriodFilterProps) {
    return (
        <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted" />
            <div className="flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
                {periods.map((period) => (
                    <button
                        key={period.value}
                        onClick={() => onChange(period.value)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                            value === period.value
                                ? "bg-[var(--ink)] text-white"
                                : "text-muted hover:text-foreground"
                        )}
                    >
                        {period.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// Utility function to filter by time period
export function filterByTimePeriod<T extends { created_at: string }>(
    items: T[],
    period: TimePeriod
): T[] {
    if (period === "all") return items;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let cutoffDate: Date;

    switch (period) {
        case "today":
            cutoffDate = startOfDay;
            break;
        case "week":
            cutoffDate = new Date(startOfDay);
            cutoffDate.setDate(cutoffDate.getDate() - 7);
            break;
        case "month":
            cutoffDate = new Date(startOfDay);
            cutoffDate.setMonth(cutoffDate.getMonth() - 1);
            break;
        default:
            return items;
    }

    return items.filter((item) => new Date(item.created_at) >= cutoffDate);
}
