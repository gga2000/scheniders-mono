"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { useLanguage } from "@/hooks/use-language";
import { formatIQD, FINANCIAL_MASK, cn } from "@/lib/utils";

interface FinancialValueProps {
    /** Raw amount to display. */
    amount: number;
    /** Formatter for the revealed value. Defaults to IQD currency. */
    format?: (n: number) => string;
    /** Classes for the value text. */
    className?: string;
    /** Classes for the eye/lock toggle. */
    iconClassName?: string;
    /** Toggle icon size in px. */
    iconSize?: number;
    /**
     * Render no inline toggle at all — value follows global reveal only. Use for
     * secondary figures that sit next to a primary one with its own toggle.
     */
    hideToggle?: boolean;
}

/**
 * A single financial figure that is masked by default and revealed via an
 * inline eye icon. Permission-gated: users without VIEW_FINANCIALS see a brief
 * "no access" hint instead of revealing. The header RevealToggle flips global
 * reveal-all, which clears any per-value override so it stays authoritative.
 */
export function FinancialValue({
    amount,
    format = formatIQD,
    className,
    iconClassName,
    iconSize = 13,
    hideToggle,
}: FinancialValueProps) {
    const { revealed, canReveal } = useFinancialVisibility();
    const { language } = useLanguage();
    const [override, setOverride] = useState<boolean | null>(null);
    const [prevRevealed, setPrevRevealed] = useState(revealed);
    const [denied, setDenied] = useState(false);

    // Global reveal-all/hide-all is authoritative: whenever it flips, drop any
    // per-value override so the header toggle affects every figure at once.
    if (prevRevealed !== revealed) {
        setPrevRevealed(revealed);
        setOverride(null);
    }

    const shown = canReveal && (override ?? revealed);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canReveal) {
            setDenied(true);
            window.setTimeout(() => setDenied(false), 1500);
            return;
        }
        setOverride(!shown);
    };

    return (
        <span className="inline-flex items-center gap-1">
            <span className={cn("tabular-nums", className)}>
                {shown ? format(amount) : FINANCIAL_MASK}
            </span>
            {hideToggle ? null : denied ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 whitespace-nowrap">
                    <Lock style={{ width: iconSize - 3, height: iconSize - 3 }} />
                    {language === "ar" ? "ممنوع" : "No access"}
                </span>
            ) : (
                <button
                    type="button"
                    onClick={handleClick}
                    aria-label={shown ? "Hide value" : "Show value"}
                    title={shown ? "Hide" : "Show"}
                    className={cn(
                        "inline-flex items-center justify-center text-foreground/55 hover:text-foreground transition-colors shrink-0",
                        iconClassName
                    )}
                >
                    {shown ? (
                        <EyeOff style={{ width: iconSize, height: iconSize }} />
                    ) : (
                        <Eye style={{ width: iconSize, height: iconSize }} />
                    )}
                </button>
            )}
        </span>
    );
}
