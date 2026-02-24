"use client";

import { RiskLevel } from "@/lib/fraud-detector";
import { cn } from "@/lib/utils";
import { AlertOctagon, AlertTriangle, ShieldCheck, Ban } from "lucide-react";

interface RiskBadgeProps {
    level: RiskLevel;
    className?: string;
    showLabel?: boolean;
}

export function RiskBadge({ level, className, showLabel = true }: RiskBadgeProps) {
    if (level === "low") return null;

    const config = {
        low: {
            icon: ShieldCheck,
            label: "آمن",
            style: "text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
        },
        medium: {
            icon: AlertTriangle,
            label: "متوسط",
            style: "text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
        },
        high: {
            icon: AlertOctagon,
            label: "عالي",
            style: "text-red-600 bg-red-50 border-red-100 dark:bg-red-500/10 dark:text-rose-400 dark:border-red-500/20",
        },
        blocked: {
            icon: Ban,
            label: "محظور",
            style: "text-gray-100 bg-gray-900 border-gray-800 dark:bg-gray-800 dark:text-white dark:border-gray-700",
        },
    };

    const { icon: Icon, label, style } = config[level];

    return (
        <div className={cn(
            "inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full border",
            style,
            className
        )}>
            <Icon className="w-3 h-3" />
            {showLabel && <span>{label}</span>}
        </div>
    );
}
