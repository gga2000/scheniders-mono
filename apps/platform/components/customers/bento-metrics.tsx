"use client";

import { motion } from "framer-motion";
import { formatIQD } from "@/lib/utils";
import { ShoppingBag, TrendingUp, Clock, Target, CalendarDays, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Health Score Component --- //

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

// --- Animated Counter Component --- //
function AnimatedCounter({ value, formatFn = (v: number) => v.toString() }: { value: number, formatFn?: (v: number) => string }) {
    const [displayValue, setDisplayValue] = useState(formatFn(0));
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            // Instantly set on first render to avoid jumping from 0 if we don't want the animation every single time
            // BUT, since we *want* the wow factor, we will animate from 0 on mount.
        }

        const controls = animate(0, value, {
            duration: 1.5,
            ease: "easeOut",
            onUpdate(currentValue) {
                setDisplayValue(formatFn(currentValue));
            },
        });

        return () => controls.stop();
    }, [value, formatFn]);

    return <span>{displayValue}</span>;
}

// ... (HealthScore Component remains unchanged)
interface HealthScoreProps {
    score: number; // 0-100
    statusText: string;
}

export function HealthScore({ score, statusText }: HealthScoreProps) {
    // Determine color based on score thresholds
    const getColor = (s: number) => {
        if (s >= 80) return "text-emerald-500 bg-emerald-50 border-emerald-100";
        if (s >= 50) return "text-amber-500 bg-amber-50 border-amber-100";
        return "text-rose-500 bg-rose-50 border-rose-100";
    };

    const colors = getColor(score);

    return (
        <div className={cn("flex items-center gap-3 px-4 py-2 rounded-2xl border", colors)}>
            <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    {/* Background Circle */}
                    <path
                        className="text-current opacity-20"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    {/* Progress Circle - animated */}
                    <motion.path
                        initial={{ strokeDasharray: "0, 100" }}
                        animate={{ strokeDasharray: `${score}, 100` }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className="text-current"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute flex items-center justify-center inset-0 text-[10px] font-bold">
                    <AnimatedCounter value={score} formatFn={(v) => Math.round(v).toString()} />
                </div>
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wide opacity-70">Loyalty Score</p>
                <p className="font-semibold text-sm">{statusText}</p>
            </div>
        </div>
    );
}

// --- Bento Metrics Component --- //

interface BentoMetricsProps {
    totalSpent: number;
    totalOrders: number;
    lastOrderDate: string;
    firstOrderDate: string;
}

export function BentoMetrics({ totalSpent, totalOrders, lastOrderDate, firstOrderDate }: BentoMetricsProps) {
    const aov = totalOrders > 0 ? totalSpent / totalOrders : 0;

    // Calculate days since last order
    const daysSinceLastOrder = Math.floor((new Date().getTime() - new Date(lastOrderDate).getTime()) / (1000 * 3600 * 24));
    const customerAgeDays = Math.max(1, Math.floor((new Date().getTime() - new Date(firstOrderDate).getTime()) / (1000 * 3600 * 24)));

    // Calculate a rough "Health Score" (0-100) based on recency, frequency, monetary
    let expectedRecency = 30; // Default expected return
    if (totalOrders > 1) {
        expectedRecency = Math.floor(customerAgeDays / totalOrders);
    }

    let rawScore = 50;

    // Recency Factor
    if (daysSinceLastOrder <= expectedRecency) rawScore += 20;
    else if (daysSinceLastOrder > expectedRecency * 2) rawScore -= 20;

    // Frequency Factor
    if (totalOrders > 5) rawScore += 15;
    else if (totalOrders === 1) rawScore -= 10;

    // Monetary Factor (assuming 100k IQD is high)
    if (aov > 100000) rawScore += 15;

    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    let statusText = "Stable";
    if (finalScore >= 80) statusText = "Champion";
    else if (finalScore < 50) statusText = "At Risk";

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">Customer Metrics</h3>
                <HealthScore score={finalScore} statusText={statusText} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* LTV */}
                <div className="pastel-card pastel-card-yellow p-5 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <TrendingUp className="w-24 h-24" />
                    </div>
                    <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center mb-3">
                            <TrendingUp className="w-5 h-5 text-amber-700" />
                        </div>
                        <p className="text-2xl font-bold text-amber-900 leading-tight">
                            <AnimatedCounter value={totalSpent} formatFn={formatIQD} />
                        </p>
                        <p className="text-xs font-semibold text-amber-700/70 uppercase tracking-widest mt-1">Lifetime Value</p>
                    </div>
                </div>

                {/* Orders */}
                <div className="pastel-card pastel-card-blue p-5 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <ShoppingBag className="w-24 h-24" />
                    </div>
                    <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center mb-3">
                            <ShoppingBag className="w-5 h-5 text-blue-700" />
                        </div>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-2xl font-bold text-blue-900 leading-tight"
                        >
                            <AnimatedCounter value={totalOrders} formatFn={(v) => Math.round(v).toString()} />
                        </motion.p>
                        <p className="text-xs font-semibold text-blue-700/70 uppercase tracking-widest mt-1">Total Orders</p>
                    </div>
                </div>

                {/* AOV */}
                <div className="pastel-card pastel-card-mint p-5 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <Target className="w-24 h-24" />
                    </div>
                    <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center mb-3">
                            <Target className="w-5 h-5 text-teal-700" />
                        </div>
                        <p className="text-2xl font-bold text-teal-900 leading-tight">
                            <AnimatedCounter value={aov} formatFn={formatIQD} />
                        </p>
                        <p className="text-xs font-semibold text-teal-700/70 uppercase tracking-widest mt-1">Avg Order Value</p>
                    </div>
                </div>

                {/* Last Order / Recency */}
                <div className={cn(
                    "pastel-card p-5 relative overflow-hidden group",
                    daysSinceLastOrder > 90 ? "pastel-card-pink" : "bg-[var(--card-bg)] border border-[var(--card-border)]"
                )}>
                    <div className="absolute -right-4 -top-4 opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
                        <CalendarDays className="w-24 h-24" />
                    </div>
                    <div className="relative">
                        <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center mb-3",
                            daysSinceLastOrder > 90 ? "bg-white/50" : "bg-[var(--background)] border border-[var(--card-border)]"
                        )}>
                            {daysSinceLastOrder > 90 ? (
                                <AlertTriangle className="w-5 h-5 text-rose-700" />
                            ) : (
                                <Clock className="w-5 h-5 text-[var(--foreground-subtle)]" />
                            )}
                        </div>
                        <p className={cn(
                            "text-2xl font-bold leading-tight",
                            daysSinceLastOrder > 90 ? "text-rose-900" : "text-foreground"
                        )}>
                            <AnimatedCounter value={daysSinceLastOrder} formatFn={(v) => Math.round(v).toString()} /> <span className="text-sm font-medium">days</span>
                        </p>
                        <p className={cn(
                            "text-xs font-semibold uppercase tracking-widest mt-1",
                            daysSinceLastOrder > 90 ? "text-rose-700/70" : "text-muted"
                        )}>Since Last Order</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
