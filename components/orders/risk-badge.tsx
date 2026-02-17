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
            style: "text-emerald-600 bg-emerald-50 border-emerald-100",
        },
        medium: {
            icon: AlertTriangle,
            label: "متوسط",
            style: "text-amber-600 bg-amber-50 border-amber-100",
        },
        high: {
            icon: AlertOctagon,
            label: "عالي",
            style: "text-red-600 bg-red-50 border-red-100",
        },
        blocked: {
            icon: Ban,
            label: "محظور",
            style: "text-gray-100 bg-gray-900 border-gray-800",
        },
    };

    const { icon: Icon, label, style } = config[level];

    return (
        <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium",
            style,
            className
        )}>
            <Icon className="w-3.5 h-3.5" />
            {showLabel && <span>{label}</span>}
        </div>
    );
}
