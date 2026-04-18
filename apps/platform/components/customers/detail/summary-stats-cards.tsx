"use client";

import { motion } from "framer-motion";
import { ShoppingBag, TrendingUp, DollarSign, RotateCcw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useEffect, useState } from "react";

function AnimatedCounter({ value, suffix }: { value: number; suffix?: string }) {
    const [display, setDisplay] = useState(0);
    useEffect(() => {
        const dur = 1200;
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            const p = Math.min(elapsed / dur, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(Math.round(eased * value));
            if (p < 1) requestAnimationFrame(tick);
        };
        tick();
    }, [value]);

    return (
        <span className="tabular-nums">{display.toLocaleString("en-US")}{suffix ? ` ${suffix}` : ""}</span>
    );
}

function formatLargeNumber(value: number): { display: string; suffix: string } {
    if (value >= 1_000_000) {
        return { display: (value / 1_000_000).toFixed(1), suffix: "M" };
    }
    if (value >= 1_000) {
        return { display: (value / 1_000).toFixed(1), suffix: "K" };
    }
    return { display: value.toLocaleString("en-US"), suffix: "" };
}

interface SummaryStatsCardsProps {
    totalOrders: number;
    totalSpent: number;
    avgBasket?: number;
    returnCount?: number;
}

export function SummaryStatsCards({ totalOrders, totalSpent, avgBasket, returnCount }: SummaryStatsCardsProps) {
    const { t } = useLanguage();
    const revenue = formatLargeNumber(totalSpent);
    const avgFormatted = avgBasket ? formatLargeNumber(avgBasket) : null;

    return (
        <div className="grid grid-cols-3 gap-4">
            {/* Order Count card — 1/3 width */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="col-span-1 group bg-muted rounded-[3rem] p-8 shadow-md hover:translate-y-[-4px] transition-all cursor-default"
            >
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                    <ShoppingBag className="w-5 h-5 text-foreground" />
                </div>

                <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
                    {t("customers.profile.orderCount")}
                </p>

                <p className="text-5xl font-headline font-black text-foreground mt-3 tabular-nums leading-none">
                    <AnimatedCounter value={totalOrders} />
                </p>

                <div className="mt-4 flex items-center gap-1 text-green-600">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">+12% {t("customers.profile.thisMonth")}</span>
                </div>
            </motion.div>

            {/* Total Revenue card — 2/3 width */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="col-span-2 group bg-muted rounded-[3rem] p-8 shadow-md hover:translate-y-[-4px] transition-all cursor-default flex items-center justify-between gap-8"
            >
                {/* Left: icon + label + big value */}
                <div className="flex-1 min-w-0">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                        <DollarSign className="w-5 h-5 text-foreground" />
                    </div>

                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
                        {t("customers.profile.totalRevenue")}
                    </p>

                    <p className="text-5xl font-headline font-black text-foreground mt-3 tabular-nums leading-none">
                        {revenue.display}
                        <span className="text-3xl ml-1 font-bold text-muted-foreground">{revenue.suffix} IQD</span>
                    </p>
                </div>

                {/* Right: trend + mini stats */}
                <div className="flex flex-col items-end gap-5 shrink-0">
                    {/* Trend badge */}
                    <div className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-full">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span className="text-xs font-bold">+12% {t("customers.profile.thisMonth")}</span>
                    </div>

                    {/* Mini stat columns */}
                    <div className="flex items-start gap-8">
                        {/* Avg Basket */}
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                {t("customers.profile.avgBasket")}
                            </p>
                            <p className="text-lg font-black text-foreground tabular-nums leading-none">
                                {avgFormatted
                                    ? `${avgFormatted.display}${avgFormatted.suffix}`
                                    : "—"}
                                {avgFormatted && (
                                    <span className="text-xs font-bold text-muted-foreground ml-1">IQD</span>
                                )}
                            </p>
                        </div>

                        {/* Returns */}
                        <div className="flex flex-col items-end">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                {t("customers.profile.returns")}
                            </p>
                            <div className="flex items-center gap-1">
                                <RotateCcw className="w-3.5 h-3.5 text-red-500" />
                                <p className="text-lg font-black text-red-500 tabular-nums leading-none">
                                    {returnCount ?? 0}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
