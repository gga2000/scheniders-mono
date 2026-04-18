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

    const showStores = !!storeCount && storeCount > 1;

    const fullLabel = t("customers.trust.basedOn", {
        orders: orderCount.toLocaleString("en-US"),
        stores: showStores ? storeCount.toLocaleString("en-US") : "",
    });

    // When store count is absent or 1, trim the trailing "from  stores" / "من  متجر" fragment
    const label = showStores
        ? fullLabel
        : fullLabel.replace(/\s+(?:from\s.*|من\s.*)$/u, "");

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
