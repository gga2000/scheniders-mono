"use client";

import { formatIQD } from "@/lib/utils";

interface CostBreakdownItemProps {
    label: string;
    amount: number;
    percentage?: number;
    color: string;
    showPercentage?: boolean;
}

export function CostBreakdownItem({
    label,
    amount,
    percentage,
    color,
    showPercentage = true,
}: CostBreakdownItemProps) {
    return (
        <div className="flex items-center justify-between p-2.5 rounded-lg backdrop-blur-sm bg-white/40 dark:bg-slate-800/40 border border-white/30 dark:border-slate-700/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all duration-200">
            <div className="flex items-center gap-3">
                <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                />
                <span className="text-sm font-medium text-foreground">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground tabular-nums">
                    IQD {formatIQD(amount)}
                </span>
                {showPercentage && percentage !== undefined && (
                    <span className="text-xs text-muted tabular-nums w-12 text-right">
                        {percentage.toFixed(1)}%
                    </span>
                )}
            </div>
        </div>
    );
}
