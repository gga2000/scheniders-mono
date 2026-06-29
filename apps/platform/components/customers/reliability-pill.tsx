"use client";

import { ShieldCheck, Clock, AlertTriangle, Sparkles, Ban, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { RELIABILITY_META, type Reliability } from "@/lib/customer-reliability";

const ICONS: Record<Reliability, React.ComponentType<{ className?: string }>> = {
    excellent: Crown,
    good: ShieldCheck,
    watch: Clock,
    risky: AlertTriangle,
    new: Sparkles,
    blocked: Ban,
};

interface ReliabilityPillProps {
    reliability: Reliability;
    score: number;
    /** `hero` = the prominent in-card block; `compact` = small inline pill for rows. */
    variant?: "hero" | "compact";
    /** Override score visibility (hidden for customers with too little history to score). */
    showScore?: boolean;
    className?: string;
}

/**
 * The single hero signal of the customers page: a human, labelled reliability
 * state (Excellent / Good / Watch / Risky / New) in its semantic colour, with a
 * clamped 0–100 score. Replaces the old cryptic trust ring.
 */
export function ReliabilityPill({ reliability, score, variant = "hero", showScore, className }: ReliabilityPillProps) {
    const { t } = useLanguage();
    const meta = RELIABILITY_META[reliability];
    const Icon = ICONS[reliability];
    const label = t(`customers.reliability.${reliability}`);
    const show = showScore ?? (reliability !== "new" && reliability !== "blocked");

    if (variant === "compact") {
        return (
            <span
                className={cn(
                    "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold",
                    meta.pillBg,
                    meta.pillText,
                    className,
                )}
            >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {show && <span className="font-mono font-semibold opacity-80 tabular-nums">{score}</span>}
            </span>
        );
    }

    return (
        <div
            className={cn(
                "flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3",
                meta.pillBg,
                meta.pillText,
                className,
            )}
        >
            <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 leading-none">
                        {t("customers.reliability.label")}
                    </div>
                    <div className="text-base font-extrabold tracking-tight leading-tight truncate">{label}</div>
                </div>
            </div>
            {show && (
                <div className="font-mono text-2xl font-semibold tabular-nums shrink-0">
                    {score}
                    <span className="text-xs opacity-60">/100</span>
                </div>
            )}
        </div>
    );
}
