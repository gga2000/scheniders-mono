"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface TrustHistoryCardProps {
    data: { month: string; avg_score: number; event_count: number }[];
}

export function TrustHistoryCard({ data }: TrustHistoryCardProps) {
    const { t } = useLanguage();
    const [period, setPeriod] = useState<6 | 12>(12);

    const displayData = data.slice(-period);
    const lastIndex = displayData.length - 1;

    return (
        <div
            className="bg-(--card-bg) rounded-[3rem] p-8 border border-(--card-border) flex flex-col justify-between"
            style={{
                boxShadow:
                    "0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)"
                    .split("_").join(" "),
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-foreground" />
                    <span className="font-headline font-extrabold text-lg leading-none">
                        {t("customers.trust.history")}
                    </span>
                    <span className="bg-[#c7f8ef] text-[#1f4e48] text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                        Premium
                    </span>
                </div>

                {/* Period toggle */}
                <div className="flex items-center gap-1">
                    {([6, 12] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className="relative"
                        >
                            {period === p && (
                                <motion.div
                                    layoutId="trust-history-period-pill"
                                    className="absolute inset-0 bg-foreground rounded-full"
                                    transition={{
                                        type: "spring",
                                        stiffness: 500,
                                        damping: 35,
                                    }}
                                />
                            )}
                            <span
                                className={`relative z-10 block px-4 py-1.5 rounded-full text-[10px] font-bold transition-colors ${
                                    period === p
                                        ? "text-background"
                                        : "bg-muted/30 text-muted-foreground"
                                }`}
                            >
                                {p === 6 ? "6 Month" : "1 Year"}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart area */}
            {displayData.length === 0 ? (
                <div className="h-48 w-full flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">
                        No data available
                    </p>
                </div>
            ) : (
                <>
                    <div className="h-48 w-full flex items-end justify-between gap-4 px-2">
                        <AnimatePresence initial={false}>
                            {displayData.map((entry, i) => {
                                const heightPct = Math.max(
                                    (entry.avg_score / 100) * 100,
                                    2
                                );
                                const isCurrent = i === lastIndex;
                                const score = Math.round(entry.avg_score);

                                return (
                                    <div
                                        key={`${period}-${i}`}
                                        className="group flex-1 flex flex-col items-stretch relative"
                                        style={{ height: "100%" }}
                                    >
                                        {/* Score label above bar */}
                                        <div
                                            className={`absolute bottom-full mb-1 w-full flex justify-center transition-opacity duration-200 ${
                                                isCurrent
                                                    ? "opacity-100"
                                                    : "opacity-0 group-hover:opacity-100"
                                            }`}
                                        >
                                            <span className="text-[10px] font-bold text-foreground tabular-nums">
                                                {score}
                                            </span>
                                        </div>

                                        {/* Bar */}
                                        <div
                                            className="flex-1 flex items-end"
                                        >
                                            <motion.div
                                                key={`bar-${period}-${i}`}
                                                className={`w-full rounded-t-2xl transition-colors duration-200 ${
                                                    isCurrent
                                                        ? "bg-[#FBE38E]"
                                                        : "bg-[#FBE38E]/10 hover:bg-[#FBE38E]/40"
                                                }`}
                                                initial={{ height: 0 }}
                                                animate={{
                                                    height: `${heightPct}%`,
                                                }}
                                                transition={{
                                                    delay: i * 0.04,
                                                    duration: 0.45,
                                                    ease: "easeOut",
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </AnimatePresence>
                    </div>

                    {/* Month labels */}
                    <div className="flex justify-between mt-6 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {displayData.map((entry, i) => (
                            <span key={i} className="tabular-nums">
                                {entry.month.slice(5)}
                            </span>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
