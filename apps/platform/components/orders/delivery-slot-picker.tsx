"use client";

import { useRef, useState } from "react";
import { Clock, Sun, CloudSun, Moon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    DELIVERY_SLOT_PRESETS,
    formatDeliverySlot,
    isExactTime,
    type DeliverySlot,
    type DeliverySlotPreset,
} from "@/lib/orders/delivery-slot";

const PRESET_ICON: Record<DeliverySlotPreset, typeof Sun> = { morning: Sun, afternoon: CloudSun, evening: Moon };
const PRESET_ACTIVE: Record<DeliverySlotPreset, string> = {
    morning: "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
    afternoon: "bg-orange-50 border-orange-300 text-orange-800 dark:bg-orange-400/15 dark:text-orange-200",
    evening: "bg-indigo-50 border-indigo-300 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-200",
};

interface DeliverySlotPickerProps {
    value: DeliverySlot | undefined;
    onChange: (slot: DeliverySlot | undefined) => void;
    className?: string;
}

/**
 * Three default windows plus the customer's exact time. Clicking the active
 * choice again clears it. One picker for the create form and the order
 * details, so both save the same values.
 */
export function DeliverySlotPicker({ value, onChange, className }: DeliverySlotPickerProps) {
    const { t, language } = useLanguage();
    const lang = language === "ar" ? "ar" : "en";
    const exact = isExactTime(value) ? value : undefined;
    const [fieldOpen, setFieldOpen] = useState(false);
    // A saved exact time always shows its field, wherever it was set.
    const timeOpen = fieldOpen || !!exact;
    const timeRef = useRef<HTMLInputElement>(null);

    const pickPreset = (preset: DeliverySlotPreset) => {
        setFieldOpen(false);
        onChange(value === preset ? undefined : preset);
    };

    const openTime = () => {
        if (timeOpen) {
            setFieldOpen(false);
            if (exact) onChange(undefined);
            return;
        }
        setFieldOpen(true);
        requestAnimationFrame(() => timeRef.current?.focus());
    };

    const chip = "flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all";
    const idle = "bg-white border-[var(--card-border)] text-muted hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/5";

    return (
        <div className={cn("flex flex-wrap items-center gap-1", className)} role="group" aria-label={t("orders.slot.label")}>
            {DELIVERY_SLOT_PRESETS.map((preset) => {
                const Icon = PRESET_ICON[preset];
                const active = value === preset;
                return (
                    <button
                        key={preset}
                        type="button"
                        aria-pressed={active}
                        onClick={() => pickPreset(preset)}
                        className={cn(chip, active ? PRESET_ACTIVE[preset] : idle)}
                    >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        <span dir="auto">{formatDeliverySlot(preset, lang)}</span>
                    </button>
                );
            })}

            <button
                type="button"
                aria-pressed={timeOpen}
                onClick={openTime}
                className={cn(chip, timeOpen ? "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : idle)}
            >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {t("orders.slot.exactTime")}
            </button>

            {timeOpen && (
                <span className="flex items-center gap-1">
                    <input
                        ref={timeRef}
                        type="time"
                        step={300}
                        value={exact ?? ""}
                        aria-label={t("orders.slot.exactTime")}
                        onChange={(e) => {
                            const v = e.target.value;
                            onChange(isExactTime(v) ? v : undefined);
                        }}
                        className="h-7 rounded-lg border border-[var(--card-border)] bg-white px-2 text-[12px] tabular-nums dark:bg-transparent"
                    />
                    {exact && (
                        <button
                            type="button"
                            onClick={() => { onChange(undefined); setFieldOpen(false); }}
                            aria-label={t("orders.slot.clear")}
                            className="p-1 rounded-md text-muted hover:text-foreground hover:bg-black/5"
                        >
                            <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                    )}
                </span>
            )}
        </div>
    );
}
