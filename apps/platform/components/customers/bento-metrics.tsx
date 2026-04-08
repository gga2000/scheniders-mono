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
    const getColor = (s: number) => {
        if (s >= 80) return "text-emerald-400 bg-[#0F291E] border-emerald-500/30";
        if (s >= 50) return "text-amber-400 bg-[#2B1B0A] border-amber-500/30";
        return "text-rose-400 bg-[#2B0F15] border-rose-500/30";
    };

    const colors = getColor(score);

    // Provide a subtle glowing drop shadow for the pill
    return (
        <div className={cn("flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border shadow-[0_4px_24px_rgba(255,215,0,0.15)]", colors)}>
            <div className="relative w-8 h-8 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    {/* Background Circle */}
                    <path
                        className="text-current opacity-20"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="5"
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
                        strokeWidth="5"
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute flex items-center justify-center inset-0 text-[10px] font-black text-white drop-shadow-md">
                    <AnimatedCounter value={score} formatFn={(v) => Math.round(v).toString()} />
                </div>
            </div>
            <div className="flex flex-col">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Loyalty Score</p>
                <p className="font-bold text-sm leading-tight text-white drop-shadow-sm">{statusText}</p>
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

export function calculateLoyaltyScore(totalSpent: number, totalOrders: number, lastOrderDate: string, firstOrderDate: string) {
    const aov = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const daysSinceLastOrder = Math.floor((new Date().getTime() - new Date(lastOrderDate).getTime()) / (1000 * 3600 * 24));
    const customerAgeDays = Math.max(1, Math.floor((new Date().getTime() - new Date(firstOrderDate).getTime()) / (1000 * 3600 * 24)));

    let expectedRecency = 30; // Default expected return
    if (totalOrders > 1) {
        expectedRecency = Math.floor(customerAgeDays / totalOrders);
    }

    let rawScore = 50;
    if (daysSinceLastOrder <= expectedRecency) rawScore += 20;
    else if (daysSinceLastOrder > expectedRecency * 2) rawScore -= 20;

    if (totalOrders > 5) rawScore += 15;
    else if (totalOrders === 1) rawScore -= 10;

    if (aov > 100000) rawScore += 15;

    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
    let statusText = "Stable";
    if (finalScore >= 80) statusText = "Champion";
    else if (finalScore < 50) statusText = "At Risk";

    return { finalScore, statusText };
}

export function BentoMetrics({ totalSpent, totalOrders, lastOrderDate, firstOrderDate }: BentoMetricsProps) {
    const aov = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const daysSinceLastOrder = Math.floor((new Date().getTime() - new Date(lastOrderDate).getTime()) / (1000 * 3600 * 24));

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">Customer Metrics</h3>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* LTV - Dark Frosted Glass with yellow glow */}
                <div className="bg-gradient-to-br from-[#1C1C15]/5 to-[#262621]/10 dark:from-[#1C1C15]/70 dark:to-[#262621]/90 border border-amber-200/50 dark:border-[#3A3A2C]/50 backdrop-blur-xl shadow-[inset_0_0_20px_rgba(234,179,8,0.08)] dark:shadow-[inset_0_0_20px_rgba(234,179,8,0.03)] rounded-[1.5rem] p-[1.125rem] relative overflow-hidden group">
                    <div className="absolute right-0 top-0 w-32 h-32 opacity-[0.05] dark:opacity-[0.02] group-hover:scale-110 transition-transform duration-500 pointer-events-none">
                        <TrendingUp className="w-24 h-24 text-yellow-500" />
                    </div>
                    <div className="relative h-full flex flex-col justify-between">
                        <div className="w-9 h-9 border border-yellow-500/20 rounded-xl bg-gradient-to-br from-yellow-500/10 to-transparent flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                            <TrendingUp className="w-4 h-4 text-yellow-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-amber-950 dark:text-white shadow-sm leading-tight mb-1">
                                <AnimatedCounter value={totalSpent} formatFn={formatIQD} />
                            </p>
                            <p className="text-[10px] font-bold text-amber-700 dark:text-yellow-600 uppercase tracking-widest mt-1">Lifetime Value</p>
                        </div>
                    </div>
                </div>

                {/* Orders - Navy Frosted Glass */}
                <div className="bg-blue-50/50 dark:bg-[#0A0D14]/70 border border-blue-200/50 dark:border-[#1E2A45]/50 backdrop-blur-xl rounded-[1.5rem] p-[1.125rem] relative overflow-hidden group shadow-[inset_0_0_20px_rgba(59,130,246,0.05)] dark:shadow-[inset_0_0_20px_rgba(59,130,246,0.03)]">
                    <div className="absolute -right-4 -top-4 opacity-[0.1] dark:opacity-[0.05] group-hover:scale-110 transition-transform duration-500">
                        <ShoppingBag className="w-24 h-24 text-blue-500" />
                    </div>
                    <div className="relative h-full flex flex-col justify-between">
                        <div className="w-9 h-9 border border-blue-500/20 rounded-xl bg-blue-500/10 flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                            <ShoppingBag className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-2xl font-extrabold text-blue-950 dark:text-white shadow-sm leading-tight mb-1"
                            >
                                <AnimatedCounter value={totalOrders} formatFn={(v) => Math.round(v).toString()} />
                            </motion.p>
                            <p className="text-[10px] font-bold text-blue-600 dark:text-blue-500 uppercase tracking-widest mt-1">Total Orders</p>
                        </div>
                    </div>
                </div>

                {/* AOV - Forest Frosted Glass */}
                <div className="bg-teal-50/50 dark:bg-[#0A120E]/70 border border-teal-200/50 dark:border-[#163327]/50 backdrop-blur-xl rounded-[1.5rem] p-[1.125rem] relative overflow-hidden group shadow-[inset_0_0_20px_rgba(20,184,166,0.05)] dark:shadow-[inset_0_0_20px_rgba(20,184,166,0.03)]">
                    <div className="absolute -right-4 -top-4 opacity-[0.1] dark:opacity-[0.05] group-hover:scale-110 transition-transform duration-500">
                        <Target className="w-24 h-24 text-teal-500" />
                    </div>
                    <div className="relative h-full flex flex-col justify-between">
                        <div className="w-9 h-9 border border-teal-500/20 rounded-xl bg-teal-500/10 flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(20,184,166,0.1)]">
                            <Target className="w-4 h-4 text-teal-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-teal-950 dark:text-white shadow-sm leading-tight mb-1">
                                <AnimatedCounter value={aov} formatFn={formatIQD} />
                            </p>
                            <p className="text-[10px] font-bold text-teal-600 dark:text-teal-500 uppercase tracking-widest mt-1">Avg Order Value</p>
                        </div>
                    </div>
                </div>

                {/* Last Order / Recency - Frosted Dark Default */}
                <div className={cn(
                    "rounded-[1.5rem] p-[1.125rem] relative overflow-hidden group border backdrop-blur-xl",
                    daysSinceLastOrder > 90
                        ? "bg-rose-50/50 dark:bg-[#1A0A0A]/70 border-rose-200/50 dark:border-[#402020]/50 shadow-[inset_0_0_20px_rgba(225,29,72,0.05)] dark:shadow-[inset_0_0_20px_rgba(225,29,72,0.03)]"
                        : "bg-gray-50/50 dark:bg-[#141414]/70 border-gray-200/50 dark:border-white/5"
                )}>
                    <div className="absolute right-0 top-0 w-32 h-32 opacity-[0.05] dark:opacity-[0.02] group-hover:scale-110 transition-transform duration-500 pointer-events-none">
                        <CalendarDays className="w-full h-full text-foreground/50 dark:text-white" />
                    </div>
                    <div className="relative h-full flex flex-col justify-between">
                        <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center mb-6",
                            daysSinceLastOrder > 90
                                ? "bg-rose-100 dark:bg-rose-500/10 border border-rose-200/50 dark:border-rose-500/20"
                                : "bg-black/5 dark:bg-black/30 border border-black/5 dark:border-white/5"
                        )}>
                            {daysSinceLastOrder > 90 ? (
                                <AlertTriangle className="w-4 h-4 text-rose-500" />
                            ) : (
                                <Clock className="w-4 h-4 text-muted-foreground" />
                            )}
                        </div>
                        <div>
                            <p className={cn(
                                "text-2xl font-bold leading-tight mb-1",
                                daysSinceLastOrder > 90 ? "text-rose-700 dark:text-rose-400" : "text-gray-900 dark:text-white"
                            )}>
                                <AnimatedCounter value={daysSinceLastOrder} formatFn={(v) => Math.round(v).toString()} /> <span className="text-base font-semibold opacity-70">days</span>
                            </p>
                            <p className={cn(
                                "text-[10px] font-bold uppercase tracking-widest mt-1",
                                daysSinceLastOrder > 90 ? "text-rose-600 dark:text-rose-500/80" : "text-muted-foreground/90 dark:text-muted-foreground/70"
                            )}>Since Last Order</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
