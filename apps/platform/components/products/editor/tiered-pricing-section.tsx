"use client";

import { TrendingDown, Plus, Trash2 } from "lucide-react";

export interface TieredPriceFormData {
    min_quantity: number;
    max_quantity: number | null;
    price: number;
}

interface TieredPricingSectionProps {
    tiers: TieredPriceFormData[];
    onChange: (tiers: TieredPriceFormData[]) => void;
    basePrice: number;
}

function detectOverlaps(tiers: TieredPriceFormData[]): boolean {
    if (tiers.length < 2) return false;
    const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        if (prev.max_quantity !== null && sorted[i].min_quantity <= prev.max_quantity) {
            return true;
        }
    }
    return false;
}

function computeDiscount(tierPrice: number, basePrice: number): string {
    if (basePrice <= 0 || tierPrice >= basePrice) return "\u2014";
    const pct = Math.round(((basePrice - tierPrice) / basePrice) * 100);
    return `-${pct}%`;
}

export function TieredPricingSection({
    tiers,
    onChange,
    basePrice,
}: TieredPricingSectionProps) {
    const hasOverlap = detectOverlaps(tiers);

    const handleAddTier = () => {
        if (tiers.length === 0) {
            onChange([{ min_quantity: 1, max_quantity: null, price: basePrice }]);
            return;
        }
        const last = tiers[tiers.length - 1];
        const newMin =
            last.max_quantity !== null
                ? last.max_quantity + 1
                : last.min_quantity + 10;
        const newPrice = Math.round(last.price * 0.9);
        onChange([
            ...tiers,
            { min_quantity: newMin, max_quantity: null, price: newPrice },
        ]);
    };

    const handleUpdate = (
        index: number,
        field: keyof TieredPriceFormData,
        value: number | null
    ) => {
        const updated = tiers.map((tier, i) => {
            if (i !== index) return tier;
            return { ...tier, [field]: value };
        });
        onChange(updated);
    };

    const handleDelete = (index: number) => {
        onChange(tiers.filter((_, i) => i !== index));
    };

    const handleNoLimitToggle = (index: number, checked: boolean) => {
        const tier = tiers[index];
        if (checked) {
            handleUpdate(index, "max_quantity", null);
        } else {
            handleUpdate(index, "max_quantity", tier.min_quantity + 9);
        }
    };

    const bestPrice =
        tiers.length > 0
            ? Math.min(...tiers.map((t) => t.price))
            : null;
    const bestDiscount =
        bestPrice !== null && basePrice > 0 && bestPrice < basePrice
            ? Math.round(((basePrice - bestPrice) / basePrice) * 100)
            : null;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={handleAddTier}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Tier
                </button>
            </div>

            {/* Empty state */}
            {tiers.length === 0 && (
                <div className="border-2 border-dashed border-[var(--card-border)] rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
                    <TrendingDown className="w-8 h-8 text-muted" />
                    <p className="text-sm text-muted">
                        No volume pricing tiers. Add tiers to offer discounts on
                        larger quantities.
                    </p>
                </div>
            )}

            {/* Tier table */}
            {tiers.length > 0 && (
                <div className="space-y-3">
                    {/* Table header */}
                    <div className="grid grid-cols-[6rem_10rem_8rem_5rem_2.5rem] gap-3 items-center">
                        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                            Min Qty
                        </span>
                        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                            Max Qty
                        </span>
                        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                            Price (IQD)
                        </span>
                        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                            Discount
                        </span>
                        <span />
                    </div>

                    {/* Tier rows */}
                    {tiers.map((tier, index) => (
                        <div
                            key={index}
                            className="grid grid-cols-[6rem_10rem_8rem_5rem_2.5rem] gap-3 items-center"
                        >
                            {/* Min Qty */}
                            <input
                                type="number"
                                value={tier.min_quantity}
                                onChange={(e) =>
                                    handleUpdate(
                                        index,
                                        "min_quantity",
                                        parseInt(e.target.value, 10) || 0
                                    )
                                }
                                min={0}
                                className="w-24 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground"
                            />

                            {/* Max Qty + No Limit toggle */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    value={
                                        tier.max_quantity !== null
                                            ? tier.max_quantity
                                            : ""
                                    }
                                    onChange={(e) =>
                                        handleUpdate(
                                            index,
                                            "max_quantity",
                                            parseInt(e.target.value, 10) || 0
                                        )
                                    }
                                    placeholder="\u221e"
                                    min={0}
                                    disabled={tier.max_quantity === null}
                                    className="w-20 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <label className="flex items-center gap-1 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={tier.max_quantity === null}
                                        onChange={(e) =>
                                            handleNoLimitToggle(
                                                index,
                                                e.target.checked
                                            )
                                        }
                                        className="w-3.5 h-3.5 accent-teal-600"
                                    />
                                    <span className="text-xs text-muted whitespace-nowrap">
                                        No limit
                                    </span>
                                </label>
                            </div>

                            {/* Price */}
                            <input
                                type="number"
                                value={tier.price}
                                onChange={(e) =>
                                    handleUpdate(
                                        index,
                                        "price",
                                        parseFloat(e.target.value) || 0
                                    )
                                }
                                min={0}
                                className="w-32 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-sm text-foreground"
                            />

                            {/* Discount badge */}
                            <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium text-center ${
                                    tier.price < basePrice
                                        ? "bg-[var(--pastel-green)] text-green-800"
                                        : "text-muted"
                                }`}
                            >
                                {computeDiscount(tier.price, basePrice)}
                            </span>

                            {/* Delete button */}
                            <button
                                type="button"
                                onClick={() => handleDelete(index)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Overlap warning */}
            {hasOverlap && (
                <p className="text-sm text-rose-600 font-medium">
                    Warning: Tier ranges overlap. Please fix to avoid pricing
                    conflicts.
                </p>
            )}

            {/* Pricing summary */}
            {tiers.length > 0 && (
                <p className="text-sm text-muted">
                    Base price: {basePrice.toLocaleString()} IQD
                    {bestPrice !== null && (
                        <>
                            {" \u00b7 "}Best volume price:{" "}
                            {bestPrice.toLocaleString()} IQD
                            {bestDiscount !== null && ` (${bestDiscount}% off)`}
                        </>
                    )}
                </p>
            )}
        </div>
    );
}
