"use client";

import { Truck, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

export type PoStatus = "draft" | "sent" | "confirmed" | "received";

export interface PoStatusInfo {
    poNumber: string;
    status: PoStatus;
    expectedDate: string | null;
    quantity: number;
}

interface PoStatusChipProps {
    info: PoStatusInfo;
    size?: "sm" | "md";
    onClick?: () => void;
}

function daysUntil(date: string | null): number | null {
    if (!date) return null;
    const then = new Date(date).getTime();
    if (Number.isNaN(then)) return null;
    const now = Date.now();
    const diff = Math.round((then - now) / (1000 * 60 * 60 * 24));
    return diff;
}

function formatEta(days: number | null, t: (key: string, vars?: Record<string, string | number>) => string): string {
    if (days === null) return "";
    if (days < 0) return t("supplies.po.overdue", { days: Math.abs(days) });
    if (days === 0) return t("supplies.po.arrivingToday");
    if (days === 1) return t("supplies.po.arrivingTomorrow");
    return t("supplies.po.arrivingIn", { days });
}

export function PoStatusChip({ info, size = "sm", onClick }: PoStatusChipProps) {
    const { t } = useLanguage();
    const eta = daysUntil(info.expectedDate);
    const isOverdue = eta !== null && eta < 0;

    let tone = "";
    let Icon = Truck;
    let prefix = "";

    if (info.status === "draft") {
        tone = "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200";
        Icon = FileText;
        prefix = t("supplies.po.draft");
    } else if (info.status === "sent") {
        tone = isOverdue
            ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100"
            : "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100";
        Icon = Truck;
        prefix = t("supplies.po.sent");
    } else if (info.status === "confirmed") {
        tone = isOverdue
            ? "bg-rose-50 text-rose-700 ring-rose-200 hover:bg-rose-100"
            : "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100";
        Icon = CheckCircle2;
        prefix = t("supplies.po.confirmed");
    } else {
        return null;
    }

    const etaLabel = formatEta(eta, t);
    const label = etaLabel ? `${prefix} · ${etaLabel}` : prefix;

    const sizing =
        size === "md"
            ? "px-2 py-0.5 text-[11px] gap-1"
            : "px-1.5 py-0.5 text-[10px] gap-0.5";
    const iconSize = size === "md" ? "w-3 h-3" : "w-2.5 h-2.5";

    const title = `${t("supplies.po.title", { po: info.poNumber, count: info.quantity })}${
        info.expectedDate ? ` · ${t("supplies.po.expected", { date: new Date(info.expectedDate).toLocaleDateString() })}` : ""
    }`;

    const className = cn(
        "inline-flex items-center rounded-full ring-1 font-medium transition-colors",
        sizing,
        tone,
        onClick ? "cursor-pointer" : ""
    );

    if (onClick) {
        return (
            <button type="button" onClick={onClick} title={title} className={className}>
                <Icon className={iconSize} />
                <span>{label}</span>
            </button>
        );
    }

    return (
        <span title={title} className={className}>
            <Icon className={iconSize} />
            <span>{label}</span>
        </span>
    );
}
