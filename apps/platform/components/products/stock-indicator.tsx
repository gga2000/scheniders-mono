"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { StockStatus } from "@/lib/supabase";

interface StockIndicatorProps {
    status: StockStatus;
    quantity?: number;
    showLabel?: boolean;
    size?: "sm" | "md" | "lg";
}

const statusConfig: Record<StockStatus, { bg: string; text: string; icon: React.ElementType; label: string }> = {
    in_stock: {
        bg: "bg-[var(--pastel-green)]",
        text: "text-green-700",
        icon: CheckCircle,
        label: "In Stock",
    },
    low_stock: {
        bg: "bg-[var(--pastel-yellow)]",
        text: "text-amber-700",
        icon: AlertTriangle,
        label: "Low Stock",
    },
    out_of_stock: {
        bg: "bg-[var(--pastel-pink)]",
        text: "text-rose-700",
        icon: XCircle,
        label: "Out of Stock",
    },
};

const sizeConfig = {
    sm: {
        container: "px-2 py-0.5",
        icon: "w-3 h-3",
        text: "text-[10px]",
    },
    md: {
        container: "px-2.5 py-1",
        icon: "w-3.5 h-3.5",
        text: "text-xs",
    },
    lg: {
        container: "px-3 py-1.5",
        icon: "w-4 h-4",
        text: "text-sm",
    },
};

export function StockIndicator({
    status,
    quantity,
    showLabel = true,
    size = "md",
}: StockIndicatorProps) {
    const config = statusConfig[status];
    const sizeStyles = sizeConfig[size];
    const Icon = config.icon;

    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg font-medium",
                config.bg,
                config.text,
                sizeStyles.container
            )}
        >
            <Icon className={sizeStyles.icon} />
            {showLabel && (
                <span className={sizeStyles.text}>
                    {config.label}
                    {quantity !== undefined && ` (${quantity})`}
                </span>
            )}
        </div>
    );
}
