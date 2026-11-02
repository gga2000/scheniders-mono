"use client";

import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

/** Marks a gift order on its card: the label prints no price for the recipient. */
export function GiftChip({ isGift, className }: { isGift: boolean | null | undefined; className?: string }) {
    const { t } = useLanguage();
    if (!isGift) return null;
    return (
        <span
            title={t("orders.gift.tip")}
            className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold",
                "bg-pink-50 text-pink-800 border-pink-200 dark:bg-pink-400/15 dark:text-pink-200 dark:border-pink-400/30",
                className,
            )}
        >
            <Gift className="w-3 h-3" aria-hidden="true" />
            {t("orders.gift.label")}
        </span>
    );
}
