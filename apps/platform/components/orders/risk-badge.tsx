"use client";

import type { RiskLevel } from "@/lib/fraud-detector";
import type { OrderRiskData } from "@/lib/customer-trust-risk";
import { cn } from "@/lib/utils";
import { AlertOctagon, AlertTriangle, ShieldCheck, Ban, Info, ExternalLink, PackageX, PackageMinus, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import Link from "next/link";
import { useLanguage } from "@/hooks/use-language";
import { useOrderStore } from "@/store/use-order-store";

interface RiskBadgeProps {
    level: RiskLevel;
    assessment?: OrderRiskData;
    customerPhone?: string;
    className?: string;
    showLabel?: boolean;
}

export function RiskBadge({ level, assessment, customerPhone, className, showLabel = true }: RiskBadgeProps) {
    const { t } = useLanguage();
    if (level === "low" && !assessment?.isBlacklisted) return null;

    const config = {
        low: {
            icon: ShieldCheck,
            label: t("orders.risk.safe"),
            style: "text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
        },
        medium: {
            icon: AlertTriangle,
            label: t("orders.risk.medium"),
            style: "text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
        },
        high: {
            icon: AlertOctagon,
            label: t("orders.risk.high"),
            style: "text-red-600 bg-red-50 border-red-100 dark:bg-red-500/10 dark:text-rose-400 dark:border-red-500/20",
        },
        blocked: {
            icon: Ban,
            label: t("orders.risk.blocked"),
            style: "text-gray-100 bg-gray-900 border-gray-800 dark:bg-gray-800 dark:text-white dark:border-gray-700",
        },
    };

    const { icon: Icon, label, style } = config[level];

    const badgeNode = (
        <div className={cn(
            "inline-flex h-6 items-center gap-1 px-2 text-[10px] font-bold rounded-full border cursor-help transition-transform hover:scale-105",
            style,
            className
        )}>
            <Icon className="w-3 h-3" />
            {showLabel && <span>{label}</span>}
        </div>
    );

    if (!assessment) {
        return badgeNode;
    }

    // Determine the phone to link (use customerPhone if provided, otherwise assume assessment has it or it's not available)
    // Wait, let's use global search for phone
    const searchUrl = customerPhone ? `/orders?search=${encodeURIComponent(customerPhone)}` : "#";

    return (
        <div onClick={(e) => e.stopPropagation()}>
            <Popover>
                <PopoverTrigger asChild>
                    {badgeNode}
                </PopoverTrigger>
                <PopoverContent className="w-[320px] sm:w-[340px] max-w-[90vw] p-0 rounded-xl overflow-hidden border-(--card-border) shadow-xl z-[9999] dark:bg-gray-900" align="center" sideOffset={8} collisionPadding={16}>
                    {/* Header */}
                    <div className={cn("px-4 py-3 flex items-center justify-between border-b", style.replace("text-", "border-").replace("bg-", "bg-opacity-50 bg-"))}>
                        <div className="flex items-center gap-2">
                            <Icon className="w-5 h-5" />
                            <span className="font-bold text-sm">{t("orders.risk.assessmentDetails")} - {label}</span>
                        </div>
                        <span className="font-bold text-lg tabular-nums">{assessment.score} / 100</span>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-4">
                        {/* Reasons */}
                        {assessment.reasons && assessment.reasons.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("orders.risk.reasons")}</h4>
                                <ul className="space-y-1">
                                    {assessment.reasons.map((reason, idx) => (
                                        <li key={idx} className="text-xs flex items-start gap-1.5 text-foreground">
                                            <span className="text-destructive font-bold mt-0.5">•</span>
                                            <span className="leading-snug">{reason.replace("⚠️ Local: ", "")}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Historical Data */}
                        {assessment.historicalData && (
                            <div className="space-y-2 pt-2 border-t border-[var(--card-border)]">
                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("orders.risk.historicalRecord")}</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-500/10 p-2 rounded-lg">
                                        <PackageX className="w-4 h-4 text-rose-500" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-muted-foreground">{t("orders.risk.rejected")}</span>
                                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400">{assessment.historicalData.rejectedCustomerFaultCount} {t("orders.risk.orders")}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-500/10 p-2 rounded-lg">
                                        <PackageMinus className="w-4 h-4 text-orange-500" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-muted-foreground">{t("orders.risk.cancelled")}</span>
                                            <span className="text-xs font-bold text-orange-700 dark:text-orange-400">{assessment.historicalData.cancelledCustomerCount} {t("orders.risk.orders")}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 p-2 rounded-lg">
                                        <Clock className="w-4 h-4 text-amber-500" />
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-muted-foreground">{t("orders.risk.noResponse")}</span>
                                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{assessment.historicalData.noResponseCount} {t("orders.risk.orders")}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">Σ</span>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-muted-foreground">{t("orders.risk.total")}</span>
                                            <span className="text-xs font-bold text-foreground">{assessment.historicalData.totalOrders} {t("orders.risk.orders")}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Deep Link to previous orders */}
                        {customerPhone && (
                            <div className="pt-2">
                                <Link
                                    href={searchUrl}
                                    onClick={() => {
                                        // Seed the search box so the orders page filters to this
                                        // customer on arrival, and updates in place when we are
                                        // already there. This previously reached for a
                                        // `window._setters` bag that nothing ever assigned, so it
                                        // silently did nothing; the store is the real owner.
                                        useOrderStore.getState().setLocalSearchQuery(customerPhone);
                                    }}
                                    className="flex items-center justify-center gap-2 w-full py-2 bg-[var(--background)] hover:bg-[var(--card-border)] border border-[var(--card-border)] rounded-lg text-xs font-bold transition-all text-primary"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    {t("orders.risk.viewPreviousOrders")}
                                </Link>
                            </div>
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
