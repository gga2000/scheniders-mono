"use client";

import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export type PeriodMode = "since_last" | "custom";

interface PayrollPeriodSelectorProps {
    mode: PeriodMode;
    onModeChange: (mode: PeriodMode) => void;
    customStart: string;
    customEnd: string;
    onCustomRangeChange: (start: string, end: string) => void;
    periodStart: string;
    periodEnd: string;
}

function fmtDate(d: string) {
    if (!d) return "";
    try {
        return format(new Date(d), "MMM d, yyyy");
    } catch {
        return d;
    }
}

export function PayrollPeriodSelector({
    mode,
    onModeChange,
    customStart,
    customEnd,
    onCustomRangeChange,
    periodStart,
    periodEnd,
}: PayrollPeriodSelectorProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Mode toggle */}
            <div className="flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)] w-fit">
                <button
                    onClick={() => onModeChange("since_last")}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        mode === "since_last"
                            ? "bg-[var(--ink)] text-white"
                            : "text-muted hover:text-foreground"
                    )}
                >
                    <Clock className="w-3.5 h-3.5" />
                    Since Last Payroll
                </button>
                <button
                    onClick={() => onModeChange("custom")}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        mode === "custom"
                            ? "bg-[var(--ink)] text-white"
                            : "text-muted hover:text-foreground"
                    )}
                >
                    <Calendar className="w-3.5 h-3.5" />
                    Custom Range
                </button>
            </div>

            {/* Custom range inputs (only in custom mode) */}
            {mode === "custom" && (
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={customStart}
                        onChange={e => onCustomRangeChange(e.target.value, customEnd)}
                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/30"
                    />
                    <span className="text-muted text-xs">→</span>
                    <input
                        type="date"
                        value={customEnd}
                        onChange={e => onCustomRangeChange(customStart, e.target.value)}
                        className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/30"
                    />
                </div>
            )}

            {/* Resolved period label */}
            {periodStart && periodEnd && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-xs text-muted whitespace-nowrap">
                    <Calendar className="w-3.5 h-3.5" />
                    {fmtDate(periodStart)} — {fmtDate(periodEnd)}
                </div>
            )}
        </div>
    );
}
