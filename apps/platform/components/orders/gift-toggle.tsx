"use client";

import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface GiftToggleProps {
    value: boolean;
    onChange: (isGift: boolean) => void;
    /** Payment is still cash on delivery, so the recipient will be asked for money. */
    collectsCash: boolean;
    className?: string;
}

/** One switch for the create form and the order details, so both save the same flag. */
export function GiftToggle({ value, onChange, collectsCash, className }: GiftToggleProps) {
    const { t } = useLanguage();
    return (
        <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
            <button
                type="button"
                aria-pressed={value}
                onClick={() => onChange(!value)}
                className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all",
                    value
                        ? "bg-pink-50 border-pink-300 text-pink-800 dark:bg-pink-400/15 dark:text-pink-200"
                        : "bg-white border-[var(--card-border)] text-muted hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/5",
                )}
            >
                <Gift className="h-3 w-3" aria-hidden="true" />
                {t("orders.gift.label")}
            </button>
            {value && collectsCash && (
                <span className="text-[11px] text-amber-700 dark:text-amber-300">{t("orders.gift.codHint")}</span>
            )}
        </div>
    );
}
