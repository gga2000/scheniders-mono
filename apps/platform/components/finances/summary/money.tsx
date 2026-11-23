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
    /** Put a plus in front of a positive amount (a difference that adds). */
    plus?: boolean;
    className?: string;
    unitClassName?: string;
}

/**
 * A dinar amount: the whole number, then a small quiet unit (IQD / د.ع).
 * In Arabic the amount is a right-to-left run, as every other page writes money
 * (lib/utils formatIQD): a reader meets the number before «د.ع», never the unit first.
 * The sign stays glued to the digits in its own left-to-right run.
 */
export function Money({ value, minus = false, plus = false, className, unitClassName }: MoneyProps) {
    const { t, language } = useLanguage();
    const negative = minus ? value !== 0 : value < 0;
    return (
        <span className={cn("whitespace-nowrap tabular-nums", className)} dir={language === "ar" ? "rtl" : "ltr"}>
            <bdi dir="ltr">
                {negative ? "−" : plus && value > 0 ? "+" : ""}
                {formatWhole(Math.abs(value))}
            </bdi>
            <span className={cn("ms-1 text-[0.68em] font-medium opacity-60", unitClassName)}>{t("common.iqd")}</span>
        </span>
    );
}

/** `formatWhole` plus the unit, for sentences built with `t(key, { amount })`. */
export function useMoneyText(): (value: number) => string {
    const { t } = useLanguage();
    // A no-break space keeps «د.ع» on the line of its number when a sentence wraps.
    return (value: number) => `${formatWhole(value)}\u00a0${t("common.iqd")}`;
}
