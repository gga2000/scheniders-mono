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

const colorClasses = {
    emerald: {
        bg: "bg-emerald-50 dark:bg-emerald-900/10",
        border: "border-emerald-100 dark:border-emerald-800/30",
        dot: "bg-emerald-500",
        text: "text-emerald-600 dark:text-emerald-400",
    },
    green: {
        bg: "bg-green-50 dark:bg-green-900/10",
        border: "border-green-100 dark:border-green-800/30",
        dot: "bg-green-600",
        text: "text-green-700 dark:text-green-400",
    },
    amber: {
        bg: "bg-amber-50 dark:bg-amber-900/10",
        border: "border-amber-100 dark:border-amber-800/30",
        dot: "bg-amber-500",
        text: "text-amber-600 dark:text-amber-400",
    },
    blue: {
        bg: "bg-blue-50 dark:bg-blue-900/10",
        border: "border-blue-100 dark:border-blue-800/30",
        dot: "bg-blue-500",
        text: "text-blue-600 dark:text-blue-400",
    },
    rose: {
        bg: "bg-rose-50 dark:bg-rose-900/10",
        border: "border-rose-100 dark:border-rose-800/30",
        dot: "bg-rose-500",
        text: "text-rose-600 dark:text-rose-400",
    },
    slate: {
        bg: "bg-slate-50 dark:bg-slate-800/10",
        border: "border-slate-100 dark:border-slate-700/30",
        dot: "bg-slate-400",
        text: "text-slate-600 dark:text-slate-400",
    },
};

export function StatusBox({ label, count, total, colorTheme, delay = 0 }: StatusBoxProps) {
    const colors = colorClasses[colorTheme];
    const percentage = total && total > 0 ? ((count / total) * 100).toFixed(0) : null;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, duration: 0.3, ease: "easeOut" }}
            className={cn(
                "p-4 rounded-xl backdrop-blur-sm border transition-all duration-200 hover:scale-[1.02]",
                colors.bg,
                colors.border
            )}
        >
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-2 h-2 rounded-full", colors.dot)} />
                <span className="text-xs text-muted uppercase tracking-wider font-medium">
                    {label}
                </span>
            </div>
            <p className={cn("text-2xl font-bold tabular-nums", colors.text)}>{count}</p>
            {percentage && (
                <p className="text-xs text-muted mt-1 tabular-nums">{percentage}%</p>
            )}
        </motion.div>
    );
}
