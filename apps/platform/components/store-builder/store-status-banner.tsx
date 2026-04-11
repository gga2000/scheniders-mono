"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type TenantStatus = "active" | "trial" | "suspended" | "cancelled";

interface StoreStatusBannerProps {
    status: TenantStatus;
}

const STATUS_CONFIG: Record<TenantStatus, {
    icon: typeof CheckCircle2;
    label: string;
    message: string;
    bgClass: string;
    textClass: string;
}> = {
    active: {
        icon: CheckCircle2,
        label: "Live",
        message: "Your store is live and accessible to customers.",
        bgClass: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",
        textClass: "text-green-800 dark:text-green-200",
    },
    trial: {
        icon: Clock,
        label: "Trial",
        message: "You're on a trial period. Upgrade to keep your store live.",
        bgClass: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
        textClass: "text-blue-800 dark:text-blue-200",
    },
    suspended: {
        icon: AlertTriangle,
        label: "Suspended",
        message: "Your store is suspended. Contact support to reactivate.",
        bgClass: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
        textClass: "text-red-800 dark:text-red-200",
    },
    cancelled: {
        icon: AlertTriangle,
        label: "Cancelled",
        message: "Your account has been cancelled.",
        bgClass: "bg-gray-50 border-gray-200 dark:bg-gray-950/30 dark:border-gray-800",
        textClass: "text-gray-800 dark:text-gray-200",
    },
};

export function StoreStatusBanner({ status }: StoreStatusBannerProps) {
    // Don't show banner for active stores — no need to distract
    if (status === "active") return null;

    const config = STATUS_CONFIG[status];
    const Icon = config.icon;

    return (
        <div role="alert" className={cn("flex items-center gap-2 px-4 py-2 text-sm border-b", config.bgClass)}>
            <Icon className={cn("w-4 h-4 shrink-0", config.textClass)} />
            <span className={cn("font-medium", config.textClass)}>{config.label}</span>
            <span className={cn("text-xs", config.textClass, "opacity-80")}>
                — {config.message}
            </span>
        </div>
    );
}
