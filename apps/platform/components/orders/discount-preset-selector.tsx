"use client";

import { useMemo } from "react";
import { Percent, Tag, Sparkles } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import type { OrderItem } from "@/lib/supabase";

interface DiscountPresetSelectorProps {
    items: OrderItem[];
    currentDiscount: number;
    onDiscountChange: (discount: number) => void;
}

type PresetType = "none" | "tiered" | "custom";

/**
 * Calculate tiered discount: 5% on first item unit, 15% on additional units
 */
function calculateTieredDiscount(items: OrderItem[]): number {
    let discount = 0;
    let unitIndex = 0;

    for (const item of items) {
        const itemPrice = Number(item.price) || 0;
        const qty = Number(item.quantity) || 1;

        for (let i = 0; i < qty; i++) {
            if (unitIndex === 0) {
                // 5% on first unit
                discount += itemPrice * 0.05;
            } else {
                // 15% on additional units
                discount += itemPrice * 0.15;
            }
            unitIndex++;
        }
    }

    return Math.round(discount);
}

export function DiscountPresetSelector({
    items,
    currentDiscount,
    onDiscountChange,
}: DiscountPresetSelectorProps) {
    const tieredDiscount = useMemo(() => calculateTieredDiscount(items), [items]);
    const totalUnits = useMemo(() => items.reduce((sum, item) => sum + (item.quantity || 1), 0), [items]);

    // Determine active preset based on current discount
    const activePreset = useMemo((): PresetType => {
        if (currentDiscount === 0) return "none";
        if (currentDiscount === tieredDiscount) return "tiered";
        return "custom";
    }, [currentDiscount, tieredDiscount]);

    const handlePresetSelect = (preset: PresetType) => {
        switch (preset) {
            case "none":
                onDiscountChange(0);
                break;
            case "tiered":
                onDiscountChange(tieredDiscount);
                break;
            case "custom":
                // Keep current value for custom - user can adjust with input
                break;
        }
    };

    // Don't show if no items
    if (items.length === 0) return null;

    return (
        <div className="space-y-2">
            <label className="text-xs text-muted flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                خصومات سريعة
            </label>

            <div className="flex gap-2">
                {/* No Discount */}
                <button
                    type="button"
                    onClick={() => handlePresetSelect("none")}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                        activePreset === "none"
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                >
                    <Tag className="h-3 w-3" />
                    بدون خصم
                </button>

                {/* Tiered Discount (5%/15%) */}
                <button
                    type="button"
                    onClick={() => handlePresetSelect("tiered")}
                    disabled={totalUnits < 1}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                        activePreset === "tiered"
                            ? "bg-green-600 text-white border-green-600"
                            : "bg-white border-green-200 text-green-700 hover:bg-green-50",
                        totalUnits < 1 && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <Percent className="h-3 w-3" />
                    {totalUnits > 1 ? "5% + 15%" : "5%"}
                </button>
            </div>

            {/* Discount Preview */}
            {activePreset === "tiered" && tieredDiscount > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                    <span className="text-xs text-green-700">
                        {totalUnits > 1
                            ? `5% على أول قطعة، 15% على ${totalUnits - 1} قطع إضافية`
                            : "5% على القطعة الأولى"
                        }
                    </span>
                    <span className="text-sm font-bold text-green-700 font-mono">
                        -{formatIQD(tieredDiscount)}
                    </span>
                </div>
            )}
        </div>
    );
}
