"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatusBoxProps {
    label: string;
    count: number;
    total?: number;
    colorTheme: "emerald" | "green" | "amber" | "blue" | "rose" | "slate";
    delay?: number;
}

const DOT: Record<StatusBoxProps["colorTheme"], string> = {
    emerald: "bg-emerald-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    rose: "bg-rose-500",
    slate: "bg-slate-400",
};

export function StatusBox({ label, count, total, colorTheme, delay = 0 }: StatusBoxProps) {
        const percentage = total && total > 0 ? ((count / total) * 100).toFixed(0) : null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, duration: 0.3, ease: "easeOut" }}
            className={cn(
                "p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]"
            )}
        >
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-2 h-2 rounded-full", DOT[colorTheme])} />
                <span className="text-xs text-muted uppercase tracking-wider font-medium">
                    {label}
                </span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{count}</p>
            {percentage && (
                <p className="text-xs text-muted mt-1 tabular-nums">{percentage}%</p>
            )}
        </motion.div>
    );
}
