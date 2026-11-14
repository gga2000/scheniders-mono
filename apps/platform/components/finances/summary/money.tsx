"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** A whole number with thousands separators, in Latin digits in every language. */
export function formatWhole(value: number): string {
    return WHOLE.format(Math.round(value));
}

interface MoneyProps {
    value: number;
    /** Put a minus in front (a cost line), whatever the sign of `value`. */
    minus?: boolean;
    className?: string;
    unitClassName?: string;
}

/** A dinar amount: the whole number, then a small quiet unit (IQD / د.ع). */
export function Money({ value, minus = false, className, unitClassName }: MoneyProps) {
    const { t } = useLanguage();
    const negative = minus ? value !== 0 : value < 0;
    return (
        <span className={cn("whitespace-nowrap tabular-nums", className)} dir="ltr">
            {negative ? "−" : ""}
            {formatWhole(Math.abs(value))}
            <span className={cn("ms-1 text-[0.68em] font-medium opacity-60", unitClassName)}>{t("common.iqd")}</span>
        </span>
    );
}

/** `formatWhole` plus the unit, for sentences built with `t(key, { amount })`. */
export function useMoneyText(): (value: number) => string {
    const { t } = useLanguage();
    return (value: number) => `${formatWhole(value)} ${t("common.iqd")}`;
}
