"use client";

import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeltaProps {
    value: number;
    inverse?: boolean;
    unit?: "%" | "abs";
    size?: "sm" | "md" | "lg";
    variant?: "badge" | "inline";
    className?: string;
}

export function Delta({
    value,
    inverse = false,
    unit = "%",
    size = "sm",
    variant = "badge",
    className,
}: DeltaProps) {
    const isZero = !isFinite(value) || Math.abs(value) < 0.05;
    const rawPositive = value > 0;
    const good = isZero ? null : inverse ? !rawPositive : rawPositive;
    const Icon = isZero ? Minus : rawPositive ? ArrowUp : ArrowDown;

    const tone =
        good === null
            ? "bg-[var(--card-border)] text-muted"
            : good
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400";

    const sizes = {
        sm: "text-[11px] px-1.5 py-0.5 gap-0.5",
        md: "text-xs px-2 py-1 gap-1",
        lg: "text-sm px-2.5 py-1.5 gap-1",
    };

    const iconSizes = {
        sm: "w-2.5 h-2.5",
        md: "w-3 h-3",
        lg: "w-3.5 h-3.5",
    };

    const formatted = isZero
        ? "0"
        : `${Math.abs(value) < 10 ? Math.abs(value).toFixed(1) : Math.round(Math.abs(value))}`;

    if (variant === "inline") {
        return (
            <span
                className={cn(
                    "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                    good === null ? "text-muted" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                    className
                )}
            >
                <Icon className={iconSizes[size]} />
                {formatted}
                {unit === "%" && "%"}
            </span>
        );
    }

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full font-semibold tabular-nums",
                tone,
                sizes[size],
                className
            )}
        >
            <Icon className={iconSizes[size]} />
            {formatted}
            {unit === "%" && "%"}
        </span>
    );
}
