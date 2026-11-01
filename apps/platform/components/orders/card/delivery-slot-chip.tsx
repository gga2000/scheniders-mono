"use client";

import { Clock, CloudSun, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { formatDeliverySlot, isPresetSlot, parseDeliverySlot } from "@/lib/orders/delivery-slot";

const ICON = { morning: Sun, afternoon: CloudSun, evening: Moon } as const;
const TONE = {
    morning: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/30",
    afternoon: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-400/15 dark:text-orange-200 dark:border-orange-400/30",
    evening: "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-400/15 dark:text-indigo-200 dark:border-indigo-400/30",
    exact: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:border-emerald-400/30",
} as const;

/** The customer's delivery time on an order card: "مساءً 4–8" or "4:30 م". */
export function DeliverySlotChip({ slot, className }: { slot: string | null | undefined; className?: string }) {
    const { t, language } = useLanguage();
    const value = parseDeliverySlot(slot);
    if (!value) return null;
    const preset = isPresetSlot(value) ? value : null;
    const Icon = preset ? ICON[preset] : Clock;
    return (
        <span
            data-delivery-slot={value}
            title={t("orders.slot.label")}
            className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold",
                TONE[preset ?? "exact"],
                className,
            )}
        >
            <Icon className="w-3 h-3" aria-hidden="true" />
            <span dir="auto">{formatDeliverySlot(value, language === "ar" ? "ar" : "en")}</span>
        </span>
    );
}
