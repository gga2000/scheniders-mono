"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface FinanceValueProps {
    value: number;
    currency?: "IQD" | "USD" | "none";
    abbreviate?: boolean;
    compact?: boolean;
    signed?: boolean;
    className?: string;
    decimals?: number;
}

export function formatFinance(
    value: number,
    opts: { currency?: "IQD" | "USD" | "none"; abbreviate?: boolean; signed?: boolean; decimals?: number } = {}
): { body: string; unit: string } {
    const { currency = "IQD", abbreviate = false, signed = false, decimals } = opts;
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : value > 0 && signed ? "+" : "";

    let body: string;
    if (abbreviate && abs >= 1_000_000) {
        body = `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
    } else if (abbreviate && abs >= 10_000) {
        body = `${sign}${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
    } else {
        body = `${sign}${new Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimals ?? 0,
            maximumFractionDigits: decimals ?? 0,
        }).format(abs)}`;
    }

    const unit = currency === "none" ? "" : currency;
    return { body, unit };
}

export function FinanceValue({
    value,
    currency = "IQD",
    abbreviate = false,
    compact = false,
    signed = false,
    className,
    decimals,
}: FinanceValueProps) {
    const { t } = useLanguage();
    const { body, unit: code } = formatFinance(value, { currency, abbreviate, signed, decimals });
    // The dinar is written د.ع in Arabic; other currency codes stay as they are.
    const unit = code === "IQD" ? t("common.iqd") : code;

    return (
        <span
            className={cn(
                "tabular-nums",
                compact ? "font-semibold" : "font-bold",
                className
            )}
        >
            {body}
            {unit && (
                <span className={cn("ml-1 font-medium opacity-60", compact ? "text-[0.75em]" : "text-[0.6em]")}>
                    {unit}
                </span>
            )}
        </span>
    );
}
