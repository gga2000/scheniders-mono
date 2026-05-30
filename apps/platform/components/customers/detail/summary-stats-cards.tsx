"use client";

import { motion } from "framer-motion";
import { ShoppingBag, TrendingUp, TrendingDown, DollarSign, RotateCcw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useEffect, useMemo, useState } from "react";

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

type Order = { created_at: string; status: string; total_price: number | string };

interface SummaryStatsCardsProps {
    totalOrders: number;
    totalSpent: number;
    orders: Order[];
}

interface MoMTrend {
    orderCountPct: number | null;
    revenuePct: number | null;
    monthsOfHistory: number;
}

function computeMoM(orders: Order[]): MoMTrend {
    if (orders.length === 0) return { orderCountPct: null, revenuePct: null, monthsOfHistory: 0 };

    // Group by YYYY-MM
    const byMonth = new Map<string, { count: number; revenue: number }>();
    for (const o of orders) {
        const d = new Date(o.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const current = byMonth.get(key) || { count: 0, revenue: 0 };
        current.count += 1;
        current.revenue += Number(o.total_price || 0);
        byMonth.set(key, current);
    }

    const monthsOfHistory = byMonth.size;
    if (monthsOfHistory < 2) {
        return { orderCountPct: null, revenuePct: null, monthsOfHistory };
    }

    const sortedKeys = [...byMonth.keys()].sort();
    const last = byMonth.get(sortedKeys[sortedKeys.length - 1])!;
    const prev = byMonth.get(sortedKeys[sortedKeys.length - 2])!;

    const orderCountPct =
        prev.count === 0 ? null : Math.round(((last.count - prev.count) / prev.count) * 100);
    const revenuePct =
        prev.revenue === 0 ? null : Math.round(((last.revenue - prev.revenue) / prev.revenue) * 100);

    return { orderCountPct, revenuePct, monthsOfHistory };
}

function TrendBadge({ pct, label }: { pct: number; label: string }) {
    const positive = pct >= 0;
    return (
        <div
            className={
                positive
                    ? "flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-full"
                    : "flex items-center gap-1.5 bg-rose-100 text-rose-700 px-3 py-1.5 rounded-full"
            }
        >
            {positive ? (
                <TrendingUp className="w-3.5 h-3.5" />
            ) : (
                <TrendingDown className="w-3.5 h-3.5" />
            )}
            <span className="text-xs font-bold">
                {positive ? "+" : ""}
                {pct}% {label}
            </span>
        </div>
    );
}

export function SummaryStatsCards({ totalOrders, totalSpent, orders }: SummaryStatsCardsProps) {
    const { t } = useLanguage();

    const avgBasket = totalOrders > 0 ? totalSpent / totalOrders : null;
    const returnCount = useMemo(
        () =>
            orders.filter((o) => {
                const s = o.status?.toLowerCase();
                return s === "rejected" || s === "returned" || s === "refunded";
            }).length,
        [orders]
    );

    const trend = useMemo(() => computeMoM(orders), [orders]);

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

                {trend.orderCountPct !== null && (
                    <div className="mt-4">
                        <TrendBadge
                            pct={trend.orderCountPct}
                            label={t("customers.profile.thisMonth")}
                        />
                    </div>
                )}
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
                    {trend.revenuePct !== null && (
                        <TrendBadge
                            pct={trend.revenuePct}
                            label={t("customers.profile.thisMonth")}
                        />
                    )}

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
                                    {returnCount}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
