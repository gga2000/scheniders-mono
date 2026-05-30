"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, AlertTriangle, CheckCircle2, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/hooks/use-finance-insights";

const SEVERITY_STYLES: Record<Insight["severity"], { icon: typeof Lightbulb; card: string; iconWrap: string; accent: string }> = {
    info: {
        icon: Lightbulb,
        card: "bg-[var(--card-bg)] border-[var(--card-border)]",
        iconWrap: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
        accent: "text-slate-600",
    },
    positive: {
        icon: TrendingUp,
        card: "bg-emerald-500/5 border-emerald-500/20",
        iconWrap: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        accent: "text-emerald-700 dark:text-emerald-300",
    },
    warning: {
        icon: AlertTriangle,
        card: "bg-amber-500/5 border-amber-500/20",
        iconWrap: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        accent: "text-amber-700 dark:text-amber-300",
    },
    critical: {
        icon: AlertTriangle,
        card: "bg-rose-500/5 border-rose-500/20",
        iconWrap: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
        accent: "text-rose-700 dark:text-rose-300",
    },
};

interface InsightsBannerProps {
    insights: Insight[];
}

export function InsightsBanner({ insights }: InsightsBannerProps) {
    const [idx, setIdx] = useState(0);
    if (insights.length === 0) return null;

    const insight = insights[Math.min(idx, insights.length - 1)];
    const style = SEVERITY_STYLES[insight.severity];
    const Icon = style.icon;

    return (
        <div className={cn("rounded-2xl border p-4 flex items-start gap-3", style.card)}>
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", style.iconWrap)}>
                <Icon className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                    <AnimatePresence mode="wait">
                        <motion.h4
                            key={insight.id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className={cn("text-[14px] font-semibold", style.accent)}
                        >
                            {insight.title}
                        </motion.h4>
                    </AnimatePresence>
                    {insights.length > 1 && (
                        <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[11px] text-muted tabular-nums">
                                {Math.min(idx + 1, insights.length)} / {insights.length}
                            </span>
                            <button
                                onClick={() => setIdx((i) => (i - 1 + insights.length) % insights.length)}
                                className="w-6 h-6 rounded-md hover:bg-[var(--card-border)] flex items-center justify-center"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 text-muted" />
                            </button>
                            <button
                                onClick={() => setIdx((i) => (i + 1) % insights.length)}
                                className="w-6 h-6 rounded-md hover:bg-[var(--card-border)] flex items-center justify-center"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-muted" />
                            </button>
                        </div>
                    )}
                </div>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={insight.id + "-body"}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-[13px] text-muted leading-relaxed"
                    >
                        {insight.detail}
                        {insight.suggestion && (
                            <span className="block mt-1 text-foreground/80 italic">{insight.suggestion}</span>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
            {insight.metric && (
                <div className="hidden md:flex flex-col items-end shrink-0 border-l border-[var(--card-border)] pl-3 ml-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{insight.metric.label}</div>
                    <div className={cn("text-xl font-bold tabular-nums", style.accent)}>{insight.metric.value}</div>
                </div>
            )}
        </div>
    );
}
