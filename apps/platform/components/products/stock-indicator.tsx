"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, XCircle, Package } from "lucide-react";
import { StockStatus } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { Tooltip } from "@/components/ui/tooltip";

interface StockIndicatorProps {
    status: StockStatus;
    quantity?: number;
    threshold?: number;
    reserved?: number;
    dailySalesRate?: number;
    showLabel?: boolean;
    size?: "sm" | "md" | "lg";
    showProgressBar?: boolean;
    showHoverTooltip?: boolean;
}

const statusConfig: Record<StockStatus, {
    bg: string;
    text: string;
    icon: React.ElementType;
    key: string;
    progressColor: string;
    pattern: string; // text pattern for accessibility (not color-only)
}> = {
    in_stock: {
        bg: "bg-[var(--pastel-green)]",
        text: "text-green-700",
        icon: CheckCircle,
        key: "products.stock.inStock",
        progressColor: "bg-green-400",
        pattern: "●",
    },
    low_stock: {
        bg: "bg-[var(--pastel-yellow)]",
        text: "text-amber-700",
        icon: AlertTriangle,
        key: "products.stock.lowStock",
        progressColor: "bg-amber-400",
        pattern: "▲",
    },
    out_of_stock: {
        bg: "bg-[var(--pastel-pink)]",
        text: "text-rose-700",
        icon: XCircle,
        key: "products.stock.outOfStock",
        progressColor: "bg-red-400",
        pattern: "✕",
    },
};

const sizeConfig = {
    sm: {
        container: "px-2 py-0.5",
        icon: "w-3 h-3",
        text: "text-[10px]",
        progressHeight: "h-1",
        progressWidth: "w-12",
    },
    md: {
        container: "px-2.5 py-1",
        icon: "w-3.5 h-3.5",
        text: "text-xs",
        progressHeight: "h-1.5",
        progressWidth: "w-16",
    },
    lg: {
        container: "px-3 py-1.5",
        icon: "w-4 h-4",
        text: "text-sm",
        progressHeight: "h-2",
        progressWidth: "w-20",
    },
};

export function StockIndicator({
    status,
    quantity,
    threshold,
    reserved,
    dailySalesRate,
    showLabel = true,
    size = "md",
    showProgressBar = false,
    showHoverTooltip = false,
}: StockIndicatorProps) {
    const { t } = useLanguage();
    const config = statusConfig[status];
    const sizeStyles = sizeConfig[size];
    const Icon = config.icon;

    // Calculate progress ratio if threshold provided
    const effectiveThreshold = threshold || 10;
    const ratio = quantity !== undefined
        ? Math.min(quantity / effectiveThreshold, 2)
        : 1;

    // Build accessible label
    const accessibleLabel = [
        t(config.key),
        quantity !== undefined ? `${quantity}` : "",
        threshold ? `/ ${threshold}` : "",
    ].filter(Boolean).join(" ");

    // Tooltip data
    const total = quantity !== undefined ? quantity + (reserved ?? 0) : undefined;
    const daysToStockout = dailySalesRate && dailySalesRate > 0 && quantity !== undefined
        ? Math.floor(quantity / dailySalesRate)
        : null;
    const reorderSuggestion = threshold && dailySalesRate
        ? Math.max(Math.ceil(threshold + dailySalesRate * 14), threshold * 2)
        : null;

    const tooltipContent = showHoverTooltip ? (
        <div className="w-56 space-y-1.5">
            <div className="flex items-center justify-between"><span className="text-white/60">{t("products.stock.tip.available")}</span><span className="font-semibold">{quantity ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-white/60">{t("products.stock.tip.reserved")}</span><span className="font-semibold">{reserved ?? 0}</span></div>
            <div className="flex items-center justify-between"><span className="text-white/60">{t("products.stock.tip.total")}</span><span className="font-semibold">{total ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-white/60">{t("products.stock.tip.threshold")}</span><span className="font-semibold">{threshold ?? "—"}</span></div>
            {reorderSuggestion !== null && (
                <div className="flex items-center justify-between"><span className="text-white/60">{t("products.stock.tip.reorderTo")}</span><span className="font-semibold">{reorderSuggestion}</span></div>
            )}
            {daysToStockout !== null && (
                <div className="flex items-center justify-between"><span className="text-white/60">{t("products.stock.tip.stockoutIn")}</span><span className="font-semibold">{t("products.stock.tip.days").replace("{days}", String(daysToStockout))}</span></div>
            )}
        </div>
    ) : null;

    const indicator = (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg font-medium",
                config.bg,
                config.text,
                sizeStyles.container
            )}
            role="status"
            aria-label={accessibleLabel}
            tabIndex={showHoverTooltip ? 0 : undefined}
        >
            <Icon className={sizeStyles.icon} aria-hidden="true" />
            {showLabel && (
                <span className={sizeStyles.text}>
                    {t(config.key)}
                    {quantity !== undefined && threshold ? (
                        <span className="opacity-75"> {quantity}/{threshold}</span>
                    ) : quantity !== undefined ? (
                        <span className="opacity-75"> ({quantity})</span>
                    ) : null}
                </span>
            )}
        </div>
    );

    return (
        <div className="inline-flex flex-col gap-1">
            {showHoverTooltip ? (
                <Tooltip
                    content={tooltipContent}
                    side="top"
                    align="start"
                    contentClassName="rounded-xl bg-[var(--ink)] text-white text-[11px] p-3 shadow-2xl"
                >
                    {indicator}
                </Tooltip>
            ) : (
                indicator
            )}

            {/* Optional mini progress bar */}
            {showProgressBar && quantity !== undefined && (
                <div
                    className={cn(
                        "rounded-full overflow-hidden bg-[var(--background)]",
                        sizeStyles.progressHeight,
                        sizeStyles.progressWidth
                    )}
                    role="progressbar"
                    aria-valuenow={quantity}
                    aria-valuemax={effectiveThreshold}
                    aria-label={t("products.stock.tip.level").replace("{quantity}", String(quantity)).replace("{threshold}", String(effectiveThreshold))}
                >
                    <div
                        className={cn(
                            "h-full rounded-full transition-all",
                            ratio > 1 ? "bg-blue-400" :
                                ratio > 0.5 ? config.progressColor :
                                    ratio > 0.25 ? "bg-amber-400" :
                                        ratio > 0 ? "bg-red-400" : "bg-gray-300"
                        )}
                        style={{ width: `${Math.min(ratio * 50, 100)}%` }}
                    />
                </div>
            )}
        </div>
    );
}
