"use client";

import React from "react";
import { AlertTriangle, Moon, Package, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProductScore, HealthGrade } from "@/lib/utils/product-scoring";

// =============================================
// PROPS
// =============================================

interface HealthScoreBadgeProps {
    score: ProductScore;
    size?: "sm" | "md" | "lg";
    showTooltip?: boolean;
}

// =============================================
// CONSTANTS
// =============================================

const gradeColors: Record<HealthGrade, string> = {
    A: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30",
    B: "bg-blue-500/15 text-blue-700 ring-blue-500/30",
    C: "bg-amber-500/15 text-amber-700 ring-amber-500/30",
    D: "bg-orange-500/15 text-orange-700 ring-orange-500/30",
    F: "bg-rose-500/15 text-rose-700 ring-rose-500/30",
};

const sizeClasses: Record<NonNullable<HealthScoreBadgeProps["size"]>, string> = {
    sm: "w-6 h-6 text-[10px]",
    md: "w-8 h-8 text-xs",
    lg: "w-12 h-12 text-lg",
};

// =============================================
// HELPERS
// =============================================

function getBarColor(value: number): string {
    if (value > 15) return "bg-emerald-500";
    if (value > 8) return "bg-amber-500";
    return "bg-rose-500";
}

function getCriticalFlag(flags: ProductScore["flags"]) {
    if (flags.isUnderstocked) return "understock" as const;
    if (flags.isDeadStock) return "dead" as const;
    if (flags.isSlowMover) return "slow" as const;
    if (flags.isOverstocked) return "overstock" as const;
    return null;
}

const flagIcons = {
    understock: AlertTriangle,
    dead: Moon,
    slow: TrendingDown,
    overstock: Package,
} as const;

const flagColors: Record<keyof typeof flagIcons, string> = {
    understock: "bg-amber-500/15 text-amber-700 ring-amber-500/30",
    dead: "bg-rose-500/15 text-rose-700 ring-rose-500/30",
    slow: "bg-orange-500/15 text-orange-700 ring-orange-500/30",
    overstock: "bg-blue-500/15 text-blue-700 ring-blue-500/30",
};

// =============================================
// TOOLTIP ROW
// =============================================

function ScoreRow({ label, value, max }: { label: string; value: number; max: number }) {
    const pct = Math.round((value / max) * 100);
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-foreground w-16 shrink-0">{label}</span>
            <span className="text-xs font-medium w-10 text-right shrink-0">
                {value}/{max}
            </span>
            <div className="flex-1 h-1 rounded-full bg-foreground/10">
                <div
                    className={cn("h-1 rounded-full transition-all", getBarColor(value))}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

// =============================================
// COMPONENT
// =============================================

export const HealthScoreBadge = React.memo(function HealthScoreBadge({
    score,
    size = "md",
    showTooltip = true,
}: HealthScoreBadgeProps) {
    const { t } = useLanguage();

    const criticalFlag = getCriticalFlag(score.flags);
    const FlagIcon = criticalFlag ? flagIcons[criticalFlag] : null;

    const tooltipContent = (
        <div className="w-52">
            <div className="text-xs font-medium text-foreground mb-2">
                {t("products.health.grade")}: {score.overall} ({score.numericScore}/100)
            </div>
            <div className="flex flex-col gap-1.5">
                <ScoreRow
                    label={t("products.health.margin")}
                    value={score.components.marginScore}
                    max={25}
                />
                <ScoreRow
                    label={t("products.health.velocity")}
                    value={score.components.velocityScore}
                    max={25}
                />
                <ScoreRow
                    label={t("products.health.turnover")}
                    value={score.components.turnoverScore}
                    max={25}
                />
                <ScoreRow
                    label={t("products.health.supply")}
                    value={score.components.supplyScore}
                    max={25}
                />
            </div>
        </div>
    );

    const body = (
        <div className="inline-flex items-center gap-1" tabIndex={showTooltip ? 0 : undefined}>
            {/* Badge */}
            <div
                className={cn(
                    "rounded-full ring-1 font-bold flex items-center justify-center shrink-0",
                    gradeColors[score.overall],
                    sizeClasses[size],
                )}
            >
                {score.overall}
            </div>

            {/* Flag icon */}
            {FlagIcon && criticalFlag && (
                <div
                    className={cn(
                        "rounded-full ring-1 flex items-center justify-center shrink-0",
                        flagColors[criticalFlag],
                        sizeClasses[size],
                    )}
                >
                    <FlagIcon className="w-3 h-3" />
                </div>
            )}
        </div>
    );

    if (!showTooltip) return body;

    return (
        <Tooltip
            content={tooltipContent}
            side="top"
            align="center"
            contentClassName="bg-[var(--card-bg)] border border-[var(--card-border)] shadow-lg rounded-xl p-3"
        >
            {body}
        </Tooltip>
    );
});
