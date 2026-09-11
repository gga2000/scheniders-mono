"use client";

import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface FillerBadgeProps {
    /** Nothing renders when the product is not filler, so callers can mount
     *  this unconditionally instead of repeating the same guard. */
    isFiller?: boolean;
    size?: "sm" | "md";
    className?: string;
}

/**
 * Marks a product as catalogue filler — orderable by customers, but not held
 * in main stock. Deliberately quiet: filler is a normal, sellable product, so
 * the badge is a note, not a warning. It stays neutral slate rather than
 * borrowing the amber/red used for stock trouble.
 */
export function FillerBadge({ isFiller, size = "sm", className }: FillerBadgeProps) {
    const { t } = useLanguage();
    if (!isFiller) return null;

    return (
        <span
            title={t("products.filler.hint")}
            className={cn(
                "inline-flex items-center gap-1 rounded-full font-semibold",
                "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
                className
            )}
        >
            <Layers className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
            {t("products.filler.badge")}
        </span>
    );
}
