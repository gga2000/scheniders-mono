"use client";

import { useMemo } from "react";
import { ProfitSummary } from "@/types/expense";
import { formatIQD } from "@/lib/utils";

interface CostCompositionChartProps {
    summary: ProfitSummary;
}

interface ChartSegment {
    label: string;
    value: number;
    color: string;
    percentage: number;
}

export function CostCompositionChart({ summary }: CostCompositionChartProps) {
    const segments = useMemo((): ChartSegment[] => {
        const total = summary.totalCost || 1; // Avoid division by zero

        const data: ChartSegment[] = [
            {
                label: "Product Cost",
                value: summary.totalProductCost,
                color: "#f59e0b", // amber
                percentage: (summary.totalProductCost / total) * 100,
            },
            {
                label: "Delivery",
                value: summary.totalDeliveryCost,
                color: "#6366f1", // indigo
                percentage: (summary.totalDeliveryCost / total) * 100,
            },
            {
                label: "Packaging",
                value: summary.totalPackagingCost,
                color: "#8b5cf6", // violet
                percentage: (summary.totalPackagingCost / total) * 100,
            },
            {
                label: "Vials",
                value: summary.totalVialCost,
                color: "#06b6d4", // cyan
                percentage: (summary.totalVialCost / total) * 100,
            },
            {
                label: "Sample Perfume",
                value: summary.totalSamplePerfumeCost,
                color: "#ec4899", // pink
                percentage: (summary.totalSamplePerfumeCost / total) * 100,
            },
            {
                label: "Sweets",
                value: summary.totalSweetsCost,
                color: "#f97316", // orange
                percentage: (summary.totalSweetsCost / total) * 100,
            },
        ];

        // Add marketing if present
        if (summary.marketingCost > 0) {
            data.push({
                label: "Marketing",
                value: summary.marketingCost,
                color: "#3b82f6", // blue
                percentage: (summary.marketingCost / total) * 100,
            });
        }

        // Sort by value descending
        return data.filter(d => d.value > 0).sort((a, b) => b.value - a.value);
    }, [summary]);

    // Calculate cumulative angles for pie chart
    const pieData = useMemo(() => {
        let cumulativePercentage = 0;
        return segments.map(segment => {
            const startAngle = cumulativePercentage * 3.6; // 360 / 100
            cumulativePercentage += segment.percentage;
            const endAngle = cumulativePercentage * 3.6;
            return { ...segment, startAngle, endAngle };
        });
    }, [segments]);

    if (summary.totalCost === 0) {
        return (
            <div className="text-center py-8 text-muted">
                <p>No cost data available</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row items-center gap-8">
            {/* Donut Chart */}
            <div className="relative w-48 h-48">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    {pieData.map((segment, index) => {
                        const radius = 40;
                        const circumference = 2 * Math.PI * radius;
                        const strokeDasharray = (segment.percentage / 100) * circumference;
                        const strokeDashoffset = pieData
                            .slice(0, index)
                            .reduce((acc, s) => acc - (s.percentage / 100) * circumference, 0);

                        return (
                            <circle
                                key={segment.label}
                                cx="50"
                                cy="50"
                                r={radius}
                                fill="none"
                                stroke={segment.color}
                                strokeWidth="20"
                                strokeDasharray={`${strokeDasharray} ${circumference}`}
                                strokeDashoffset={strokeDashoffset}
                                className="transition-all duration-500"
                            />
                        );
                    })}
                    {/* Center hole */}
                    <circle cx="50" cy="50" r="30" fill="var(--card-bg)" />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xs text-muted">Total Cost</p>
                    <p className="text-lg font-bold text-foreground">{formatIQD(summary.totalCost)}</p>
                </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2">
                {segments.map(segment => (
                    <div
                        key={segment.label}
                        className="flex items-center justify-between gap-4 p-2 rounded-lg hover:bg-[var(--background)] transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: segment.color }}
                            />
                            <span className="text-sm font-medium text-foreground">
                                {segment.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-semibold text-foreground">
                                {formatIQD(segment.value)}
                            </span>
                            <span className="text-xs text-muted w-12 text-right">
                                {segment.percentage.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
