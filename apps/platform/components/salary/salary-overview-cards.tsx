"use client";

import { DollarSign, TrendingDown, AlertCircle, Users, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

type Tone = "emerald" | "amber" | "rose" | "blue";

const TONE_BG: Record<Tone, string> = {
    emerald: "bg-emerald-100 dark:bg-emerald-900/30",
    amber: "bg-amber-100 dark:bg-amber-900/30",
    rose: "bg-rose-100 dark:bg-rose-900/30",
    blue: "bg-blue-100 dark:bg-blue-900/30",
};
const TONE_ICON: Record<Tone, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
    blue: "text-blue-600 dark:text-blue-400",
};

function Tile({
    Icon, tone, label, value, primary = false, onClick,
}: {
    Icon: React.ElementType;
    tone: Tone;
    label: string;
    value: string;
    primary?: boolean;
    onClick?: () => void;
}) {
    const content = (
        <>
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", TONE_BG[tone])}>
                <Icon className={cn("w-4 h-4", TONE_ICON[tone])} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted leading-none mb-1">{label}</p>
                <p className={cn("font-bold text-foreground tabular-nums truncate tracking-tight", primary ? "text-lg leading-none" : "text-sm")}>
                    {value}
                </p>
            </div>
            {onClick && (
                <ChevronRight className="w-3.5 h-3.5 text-muted opacity-40 group-hover/tile:opacity-100 transition-opacity shrink-0" />
            )}
        </>
    );
    const cls = "flex items-center gap-2.5 px-4 py-3 flex-1 min-w-0";
    if (onClick) {
        return (
            <button onClick={onClick} className={cn(cls, "text-left group/tile hover:bg-[var(--background)] transition-colors cursor-pointer")}>
                {content}
            </button>
        );
    }
    return <div className={cls}>{content}</div>;
}

interface SalaryOverviewCardsProps {
    totalDue: number;
    employeeCount: number;
    totalPendingAdvances: number;
    totalPendingPenalties: number;
    onAdvancesClick?: () => void;
    onPenaltiesClick?: () => void;
}

export function SalaryOverviewCards({
    totalDue,
    employeeCount,
    totalPendingAdvances,
    totalPendingPenalties,
    onAdvancesClick,
    onPenaltiesClick,
}: SalaryOverviewCardsProps) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-stretch flex-wrap sm:flex-nowrap bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden divide-x divide-[var(--card-border)]"
        >
            <Tile Icon={DollarSign} tone="emerald" label="Total Payroll Due" value={`${fmtIQD(totalDue)} IQD`} primary />
            <Tile Icon={TrendingDown} tone="amber" label="Active Advances" value={`${fmtIQD(totalPendingAdvances)} IQD`} onClick={onAdvancesClick} />
            <Tile Icon={AlertCircle} tone="rose" label="Pending Penalties" value={`${fmtIQD(totalPendingPenalties)} IQD`} onClick={onPenaltiesClick} />
            <Tile Icon={Users} tone="blue" label="Employees" value={String(employeeCount)} />
        </motion.div>
    );
}
