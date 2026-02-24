"use client";

import { useMemo } from "react";
import { Order } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";

interface PurchaseHeatmapProps {
    orders: Order[];
}

export function PurchaseHeatmap({ orders }: PurchaseHeatmapProps) {

    // Generate the last 6 months (approx 26 weeks) of data points
    const heatmapData = useMemo(() => {
        const today = new Date();
        // Start from exactly 26 weeks ago to get a nice rectangle
        const startDate = new Date(today.getTime());
        startDate.setDate(today.getDate() - (26 * 7) + 1);

        // Create a map of YYYY-MM-DD to total spent that day
        const orderMap = new Map<string, number>();
        orders.forEach(order => {
            const dateStr = new Date(order.created_at).toISOString().split('T')[0];
            const price = Number(order.price) || 0;
            orderMap.set(dateStr, (orderMap.get(dateStr) || 0) + price);
        });

        const weeks = [];
        let currentDay = new Date(startDate.getTime());

        // Adjust currentDay to the start of its week (Sunday)
        const dayOfWeek = currentDay.getDay();
        currentDay.setDate(currentDay.getDate() - dayOfWeek);

        for (let w = 0; w < 26; w++) {
            const week = [];
            for (let d = 0; d < 7; d++) {
                const dateStr = currentDay.toISOString().split('T')[0];
                const spent = orderMap.get(dateStr) || 0;

                // Determine intensity (0 = none, 1 = low, 2 = medium, 3 = high)
                let intensity = 0;
                if (spent > 0) {
                    if (spent > 150000) intensity = 3;
                    else if (spent > 50000) intensity = 2;
                    else intensity = 1;
                }

                week.push({
                    date: dateStr,
                    spent,
                    intensity,
                    isFuture: currentDay > today,
                });

                // Move to next day
                currentDay.setDate(currentDay.getDate() + 1);
            }
            weeks.push(week);
        }

        return weeks;
    }, [orders]);

    const getIntensityClass = (intensity: number) => {
        switch (intensity) {
            case 3: return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
            case 2: return "bg-emerald-400";
            case 1: return "bg-emerald-200";
            default: return "bg-[var(--card-border)]";
        }
    };

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-foreground">Purchasing Rhythm (6mo)</h3>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                    <span>Less</span>
                    <div className="flex gap-0.5">
                        <div className="w-3 h-3 rounded-sm bg-[var(--card-border)]" />
                        <div className="w-3 h-3 rounded-sm bg-emerald-200" />
                        <div className="w-3 h-3 rounded-sm bg-emerald-400" />
                        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                    </div>
                    <span>More</span>
                </div>
            </div>

            <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide py-1">
                {heatmapData.map((week, wIndex) => (
                    <div key={wIndex} className="flex flex-col gap-1 flex-shrink-0">
                        {week.map((day, dIndex) => (
                            <div
                                key={`${wIndex}-${dIndex}`}
                                className={cn(
                                    "w-3 h-3 sm:w-4 sm:h-4 rounded-sm transition-all duration-300",
                                    getIntensityClass(day.intensity),
                                    day.isFuture && "opacity-20",
                                    day.intensity > 0 && "hover:scale-125 cursor-help relative group z-0 hover:z-10"
                                )}
                                title={day.spent > 0 ? `${day.date}: ${formatIQD(day.spent)}` : day.date}
                            >
                                {/* Tooltip hack purely with CSS/Title for simplicity without heavy tooltips */}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
