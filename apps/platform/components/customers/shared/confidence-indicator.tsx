"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface ConfidenceIndicatorProps {
    orderCount: number;
    storeCount?: number;
    className?: string;
}

export function ConfidenceIndicator({
    orderCount,
    storeCount,
    className,
}: ConfidenceIndicatorProps) {
    const { t } = useLanguage();

    if (orderCount === 0) return null;

    const showStores = !!storeCount && storeCount > 1;

    let label: string;
    if (showStores) {
        label = t("customers.trust.basedOn", {
            orders: orderCount.toLocaleString("en-US"),
            stores: storeCount.toLocaleString("en-US"),
        });
    } else if (orderCount === 1) {
        label = t("customers.trust.basedOnOne");
    } else {
        label = t("customers.trust.basedOnMany", {
            orders: orderCount.toLocaleString("en-US"),
        });
    }

    return (
        <span
            className={cn(
                "inline-flex items-center bg-muted/30 text-muted-foreground text-xs px-2.5 py-1 rounded-full",
                className
            )}
        >
            {label}
        </span>
    );
}
