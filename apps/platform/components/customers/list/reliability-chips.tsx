"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { type Reliability } from "@/lib/customer-reliability";

export type ReliabilityFilter = Reliability | "all";

const ORDER: Reliability[] = ["excellent", "good", "watch", "risky", "new"];

const DOT: Record<Reliability, string> = {
    excellent: "bg-purple-500",
    good: "bg-lime-400",
    watch: "bg-amber-500",
    risky: "bg-rose-500",
    new: "bg-blue-400",
    blocked: "bg-zinc-700",
};

export function ReliabilityChips({
    active,
    counts,
    total,
    onChange,
}: {
    active: ReliabilityFilter;
    counts: Partial<Record<Reliability, number>>;
    total: number;
    onChange: (next: ReliabilityFilter) => void;
}) {
    const { t } = useLanguage();

    const chip = (key: ReliabilityFilter, label: string, count: number, dot?: string) => {
        const isActive = active === key;
        return (
            <motion.button
                key={key}
                onClick={() => onChange(isActive ? "all" : key)}
                whileTap={{ scale: 0.96 }}
                className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors ${
                    isActive
                        ? "bg-foreground text-background border-foreground"
                        : "bg-(--card-bg) text-foreground border-(--card-border) hover:bg-black/2"
                }`}
            >
                {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
                {label}
                <span className={`font-mono text-xs tabular-nums ${isActive ? "text-background/70" : "text-muted-foreground"}`}>
                    {count.toLocaleString("en-US")}
                </span>
            </motion.button>
        );
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {chip("all", t("customers.all"), total)}
            {ORDER.map((r) => chip(r, t(`customers.reliability.${r}`).replace(" customer", ""), counts[r] ?? 0, DOT[r]))}
        </div>
    );
}

/** Reliability-group counts from the stats RPC (outcome-refined, matches the cards). */
export function reliabilityCounts(stats: {
    rel_excellent: number;
    rel_good: number;
    rel_watch: number;
    rel_risky: number;
    rel_new: number;
    blocked_count: number;
}): Partial<Record<Reliability, number>> {
    return {
        excellent: stats.rel_excellent,
        good: stats.rel_good,
        watch: stats.rel_watch,
        risky: stats.rel_risky,
        new: stats.rel_new,
        blocked: stats.blocked_count,
    };
}
