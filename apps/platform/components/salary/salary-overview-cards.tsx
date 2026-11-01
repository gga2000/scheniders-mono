"use client";

import { DollarSign, TrendingDown, AlertCircle, Users, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

function Tile({
    Icon, label, value, primary = false, onClick,
}: {
    Icon: React.ElementType;
    label: string;
    value: string;
    primary?: boolean;
    onClick?: () => void;
}) {
    const content = (
        <>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[var(--background)]">
                <Icon className="w-4 h-4 text-muted" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs text-muted leading-none mb-1.5">{label}</p>
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
    const { t } = useLanguage();
    const iqd = t("common.iqd");
    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-stretch flex-wrap sm:flex-nowrap bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden divide-x divide-[var(--card-border)]"
        >
            <Tile Icon={DollarSign} label={t("payroll.overview.totalDue")} value={`${fmtIQD(totalDue)} ${iqd}`} primary />
            <Tile Icon={TrendingDown} label={t("payroll.overview.advances")} value={`${fmtIQD(totalPendingAdvances)} ${iqd}`} onClick={onAdvancesClick} />
            <Tile Icon={AlertCircle} label={t("payroll.overview.penalties")} value={`${fmtIQD(totalPendingPenalties)} ${iqd}`} onClick={onPenaltiesClick} />
            <Tile Icon={Users} label={t("payroll.overview.employees")} value={String(employeeCount)} />
        </motion.div>
    );
}
