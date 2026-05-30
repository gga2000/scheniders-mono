"use client";

import { motion } from "framer-motion";
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
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div className="relative flex bg-[var(--background)] rounded-full p-1 border border-[var(--card-border)] h-9">
                {periods.map((period) => {
                    const isActive = value === period.value;
                    return (
                        <motion.button
                            key={period.value}
                            onClick={() => onChange(period.value)}
                            whileTap={{ scale: 0.96 }}
                            className="relative px-3.5 rounded-full text-sm font-semibold transition-colors"
                        >
                            {/* Sliding thumb — shared layoutId glides between segments */}
                            {isActive && (
                                <motion.div
                                    layoutId="time-period-thumb"
                                    className="absolute inset-0 rounded-full bg-foreground shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]"
                                    transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.9 }}
                                />
                            )}
                            <span className={`relative ${isActive ? "text-background" : "text-muted-foreground hover:text-foreground"}`}>
                                {period.label}
                            </span>
                        </motion.button>
                    );
                })}
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
