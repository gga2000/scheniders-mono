"use client";

import { useMemo } from "react";
import { Layers, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { calculateBundleStock, type BundleItem } from "@/lib/utils/bundle-stock";

interface BundleStockIndicatorProps {
    bundleItems: BundleItem[];
    size?: "sm" | "md";
}

export function BundleStockIndicator({
    bundleItems,
    size = "sm",
}: BundleStockIndicatorProps) {
    const { t } = useLanguage();
    const { products } = useProductsCrud();

    const stockResult = useMemo(
        () => calculateBundleStock(bundleItems, products),
        [bundleItems, products]
    );

    if (bundleItems.length === 0) return null;

    const { availableBundles, limitingComponent, hasStockWarning } = stockResult;

    const isOut = availableBundles === 0;
    const isLow = availableBundles > 0 && availableBundles <= 5;

    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg font-medium",
                size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                isOut
                    ? "bg-[var(--pastel-pink)] text-rose-700"
                    : isLow
                      ? "bg-[var(--pastel-yellow)] text-amber-700"
                      : "bg-[var(--pastel-green)] text-green-700"
            )}
            title={
                limitingComponent
                    ? `${t("products.bundle.limitedBy")}: ${limitingComponent.productName} (${limitingComponent.availableStock} ${t("products.bundle.available")})`
                    : undefined
            }
        >
            <Layers className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
            <span>
                {availableBundles} {t("products.bundle.bundlesAvailable")}
            </span>
            {hasStockWarning && (
                <AlertTriangle
                    className={cn(
                        "text-amber-500",
                        size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"
                    )}
                />
            )}
        </div>
    );
}
