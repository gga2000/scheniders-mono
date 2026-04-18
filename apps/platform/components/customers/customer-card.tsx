"use client";

import { motion } from "framer-motion";
import { MapPin, MessageCircle, Phone, MoreVertical, Star, Flag, Ban, ShoppingCart, Diamond } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { TRUST_TIER_CONFIG, type TrustTier } from "@/types/customer";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { TrustSparkline } from "@/components/customers/shared/trust-sparkline";

/**
 * Build a synthetic 6-point trust trend as a visual placeholder.
 * Ramps from (score - 10) up to `score`, with small per-point variance based
 * on total_orders and delivery_success_rate. Not historical — purely cosmetic
 * until `trust_history` is returned by `get_paginated_customers`.
 */
function synthesizeTrustTrend(
    score: number,
    totalOrders: number,
    successRate: number,
): number[] {
    const clampedScore = Math.max(0, Math.min(100, score));
    const start = Math.max(0, clampedScore - 10);
    // Amplitude: more orders + lower success rate => slightly more wobble
    const volatility = Math.min(
        6,
        Math.max(1, Math.log10(totalOrders + 1) * (1 + (100 - successRate) / 100)),
    );
    const points: number[] = [];
    for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const base = start + (clampedScore - start) * t;
        // Deterministic-ish wobble seeded by i + totalOrders so it's stable per customer
        const seed = Math.sin((i + 1) * (totalOrders + 7)) * volatility;
        points.push(Math.max(0, Math.min(100, base + seed)));
    }
    // Force last point to match current score exactly so the trend lands on "now"
    points[5] = clampedScore;
    return points;
}

interface CustomerCardProps {
    customer: PaginatedCustomer;
    onClick?: () => void;
    isSelected?: boolean;
    onToggleSelect?: (() => void) | ((phone: string, isShiftKey?: boolean) => void);
    onViewDetails?: (id: string) => void;
    compact?: 0 | 1 | 2;
    isVirtualized?: boolean;
    hasDuplicates?: boolean;
    onShowDuplicates?: (phone: string) => void;
}

function formatCompactValue(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return value.toLocaleString("en-US");
}

/** Normalize and format Iraqi phone for display: 0780 230 1677 */
function formatPhoneDisplay(raw: string): string {
    // Strip non-digits
    let digits = raw.replace(/\D/g, "");
    // Strip country code +964 / 964
    if (digits.startsWith("964") && digits.length > 10) {
        digits = digits.slice(3);
    }
    // Strip leading 0
    if (digits.startsWith("0")) {
        digits = digits.slice(1);
    }
    // Pad to 10 digits if needed
    digits = digits.padStart(10, "0");
    // Format: 0XXX XXX XXXX
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/* ------------------------------------------------------------------ */
/*  Last Order Status Badge                                           */
/* ------------------------------------------------------------------ */

function LastOrderStatusBadge({ status }: { status: string }) {
    const s = status?.toLowerCase();
    if (s === "delivered" || s === "completed") {
        return (
            <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-[#c7f8ef] text-[#33605a]">
                Delivered
            </span>
        );
    }
    if (s === "rejected" || s === "returned") {
        return (
            <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-red-100 text-red-700">
                Rejected
            </span>
        );
    }
    if (s === "in_transit" || s === "shipping") {
        return (
            <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-blue-100 text-blue-700">
                In Transit
            </span>
        );
    }
    if (s === "confirmed" || s === "pending") {
        return (
            <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-amber-100 text-amber-700">
                {s === "confirmed" ? "Confirmed" : "Pending"}
            </span>
        );
    }
    if (s === "cancelled") {
        return (
            <span className="inline-flex items-center px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider bg-gray-100 text-gray-600">
                Cancelled
            </span>
        );
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Trust Ring                                                        */
/* ------------------------------------------------------------------ */

function TrustRing({
    score,
    tier,
}: {
    score: number;
    tier: TrustTier;
}) {
    const config = TRUST_TIER_CONFIG[tier];

    // SVG uses viewBox 0 0 36 36 — radius 14, center 18
    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    // Normalize progress: 100 = full circle. Scores >100 still show full ring; <0 show empty.
    const normalizedProgress = Math.max(0, Math.min(score, 150)) / 150;
    const progress = normalizedProgress * circumference;

    const isPlatinum = tier === "platinum" || tier === "gold";
    const isWarning = tier === "watch" || tier === "risky";
    const isCritical = tier === "critical";
    const isBlocked = tier === "blocked";
    const isNew = tier === "new";

    // Track dash pattern per tier
    let trackDasharray: string | undefined;
    if (isBlocked) trackDasharray = "2, 2";
    else if (isCritical) trackDasharray = "3, 2";
    else if (isWarning) trackDasharray = "4, 2";
    else if (isNew) trackDasharray = "2, 1";

    // Ring color override for new tier
    const ringStroke = isNew ? "var(--pastel-mint)" : config.ringColor;

    // Score text color overrides
    let scoreColorClass = "";
    if (isCritical) scoreColorClass = "text-red-900";
    else if (isWarning) scoreColorClass = "text-red-600";
    else if (isBlocked) scoreColorClass = "text-red-700";

    // Score display — handle negative values
    const scoreDisplay = score < 0 ? `${score}` : score.toString();

    return (
        <div
            className={cn(
                "relative w-14 h-14 shrink-0",
                isPlatinum && "trust-ring-glow",
            )}
            style={
                isPlatinum
                    ? { filter: "drop-shadow(0 0 8px rgba(228,193,249,0.6))" }
                    : undefined
            }
        >
            <svg width={56} height={56} viewBox="0 0 36 36">
                {/* Track */}
                <circle
                    cx={18}
                    cy={18}
                    r={radius}
                    fill="none"
                    stroke="#E7E5E4"
                    strokeWidth={isPlatinum ? 4 : 3}
                    strokeDasharray={trackDasharray}
                />
                {/* Progress arc */}
                <motion.circle
                    cx={18}
                    cy={18}
                    r={radius}
                    fill="none"
                    stroke={ringStroke}
                    strokeWidth={isPlatinum ? 4 : 3}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: circumference - progress }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                    transform="rotate(-90 18 18)"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span
                    className={cn(
                        "font-black tabular-nums",
                        score > 99 || score < 0 ? "text-xs" : "text-sm",
                        scoreColorClass || "text-foreground",
                    )}
                    style={!scoreColorClass ? { color: config.ringColor } : undefined}
                >
                    {scoreDisplay}
                </span>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Customer Card                                                     */
/* ------------------------------------------------------------------ */

export function CustomerCard({
    customer,
    onClick,
    isSelected,
}: CustomerCardProps) {
    const { t } = useLanguage();
    const tier = customer.trust_tier;
    const config = TRUST_TIER_CONFIG[tier];

    const isPlatinum = tier === "platinum" || tier === "gold";
    const isWarning = tier === "watch" || tier === "risky" || tier === "critical";
    const isBlocked = tier === "blocked";
    const isNew = tier === "new";

    const lastOrderDays = customer.last_order_date
        ? Math.floor(
              (Date.now() - new Date(customer.last_order_date).getTime()) /
                  (1000 * 60 * 60 * 24),
          )
        : null;

    // Compute join-ago text for new customers
    const joinText = (() => {
        if (!isNew || !customer.first_order_date) return null;
        const days = Math.floor(
            (Date.now() - new Date(customer.first_order_date).getTime()) /
                (1000 * 60 * 60 * 24),
        );
        if (days === 0) return t("customers.card.joinToday");
        if (days === 1) return t("customers.card.joinYesterday");
        return t("customers.card.joinDaysAgo").replace("{days}", days.toLocaleString("en-US"));
    })();

    // Bottom-left label for warning tiers
    const warningLabel = isWarning
        ? tier === "watch"
            ? t("customers.card.underWatch")
            : t("customers.card.highRisk")
        : null;

    return (
        <motion.div
            onClick={onClick}
            whileHover={{ y: -2 }}
            className={cn(
                // Base
                "relative bg-(--card-bg) rounded-[3rem] border p-6 cursor-pointer transition-all group customer-card",
                // Normal
                !isPlatinum &&
                    !isWarning &&
                    !isBlocked &&
                    "border-(--card-border) shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.08)]",
                // Platinum / Gold
                isPlatinum &&
                    "border-pastel-purple/30 shadow-[0_2px_4px_rgba(228,193,249,0.1),0_12px_32px_rgba(228,193,249,0.15)] hover:shadow-[0_4px_8px_rgba(228,193,249,0.15),0_16px_40px_rgba(228,193,249,0.2)] overflow-hidden customer-card-platinum",
                // Warning (watch / risky)
                isWarning &&
                    "border-red-200 border-dashed shadow-[0_1px_3px_rgba(239,68,68,0.04),0_8px_24px_rgba(239,68,68,0.06)] hover:shadow-[0_2px_6px_rgba(239,68,68,0.08),0_12px_32px_rgba(239,68,68,0.1)] customer-card-warning",
                // Blocked
                isBlocked &&
                    "border-red-200 border-dashed shadow-[0_1px_3px_rgba(239,68,68,0.04),0_8px_24px_rgba(239,68,68,0.06)] hover:shadow-[0_2px_6px_rgba(239,68,68,0.08),0_12px_32px_rgba(239,68,68,0.1)] customer-card-warning",
                // Selection ring
                isSelected && "ring-2 ring-foreground",
            )}
        >
            {/* Platinum decorative blur blob */}
            {isPlatinum && (
                <div className="absolute top-0 left-0 w-24 h-24 bg-pastel-purple/10 blur-3xl pointer-events-none" />
            )}

            {/* ── Top Row ── */}
            <div className="flex items-start justify-between gap-3">
                {/* Left: ring + name/phone/address */}
                <div className="flex items-start gap-3 min-w-0">
                    <TrustRing score={customer.trust_score} tier={tier} />
                    <div className="min-w-0 pt-0.5">
                        <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-foreground truncate">
                                {customer.name}
                            </h3>
                            {isPlatinum && (
                                <Star className="w-3.5 h-3.5 text-purple-500 shrink-0 fill-purple-500" />
                            )}
                            {isBlocked && (
                                <span className="text-[8px] font-bold text-foreground bg-pastel-purple px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                                    <Flag className="w-3 h-3" />
                                    {t("customers.card.networkFlag")}
                                </span>
                            )}
                        </div>
                        <p className="text-xs font-mono text-muted-foreground tabular-nums mt-0.5">
                            {formatPhoneDisplay(customer.phone)}
                        </p>
                        <div className="mt-1 -ml-1">
                            <TrustSparkline
                                data={synthesizeTrustTrend(
                                    customer.trust_score,
                                    customer.total_orders,
                                    customer.delivery_success_rate,
                                )}
                                color={config.ringColor}
                            />
                        </div>
                        {customer.city && (
                            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{customer.city}{customer.governorate && customer.governorate !== customer.city ? `, ${customer.governorate}` : ""}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Right: last order status + LTV tier + trust tier badge */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {customer.last_order_status && (
                        <LastOrderStatusBadge status={customer.last_order_status} />
                    )}
                    {/* LTV Tier Badge */}
                    <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-0.5",
                        customer.total_spent >= 500_000 && "bg-(--pastel-purple)/60 text-purple-700",
                        customer.total_spent >= 200_000 && customer.total_spent < 500_000 && "bg-(--pastel-green)/60 text-green-700",
                        customer.total_spent >= 50_000 && customer.total_spent < 200_000 && "bg-(--pastel-yellow)/60 text-amber-700",
                        customer.total_spent < 50_000 && "bg-(--pastel-pink)/60 text-rose-700",
                    )}>
                        {customer.total_spent >= 500_000 && <Diamond className="w-2.5 h-2.5" />}
                        {customer.total_spent >= 500_000 ? "Whale" : customer.total_spent >= 200_000 ? "High" : customer.total_spent >= 50_000 ? "Medium" : "Low"}
                    </span>
                    <span className={cn(
                        "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                        config.bgClass,
                        config.textClass,
                    )}>
                        {t(config.labelKey)}
                    </span>
                </div>
            </div>

            {/* ── Stats Grid ── */}
            <div className="grid grid-cols-3 gap-2 my-4">
                {/* Total Orders */}
                <div className={cn(
                    "text-center rounded-2xl p-3",
                    isPlatinum && "bg-[var(--pastel-purple)]/15",
                    (isWarning || isBlocked) && "bg-rose-50",
                    isNew && "bg-[var(--pastel-blue)]/15",
                    !isPlatinum && !isWarning && !isBlocked && !isNew && "bg-[var(--pastel-yellow)]/25",
                )}>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center justify-center gap-0.5">
                        <ShoppingCart className={cn(
                            "w-3 h-3",
                            isPlatinum && "text-purple-500",
                            (isWarning || isBlocked) && "text-rose-500",
                            isNew && "text-blue-500",
                            !isPlatinum && !isWarning && !isBlocked && !isNew && "text-amber-500",
                        )} />
                        {t("customers.card.totalOrders")}
                    </p>
                    <p className={cn(
                        "text-lg font-black tabular-nums",
                        isPlatinum && "text-purple-700",
                        (isWarning || isBlocked) && "text-rose-700",
                        isNew && "text-blue-700",
                        !isPlatinum && !isWarning && !isBlocked && !isNew && "text-amber-700",
                    )}>
                        {customer.total_orders.toLocaleString("en-US")}
                    </p>
                </div>

                {/* Success Rate */}
                <div className={cn(
                    "text-center rounded-2xl p-3",
                    customer.delivery_success_rate >= 80 && "bg-[var(--pastel-green)]/25",
                    customer.delivery_success_rate >= 50 && customer.delivery_success_rate < 80 && "bg-[var(--pastel-yellow)]/25",
                    customer.delivery_success_rate < 50 && "bg-[var(--pastel-pink)]/25",
                )}>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                        {t("customers.card.successRate")}
                    </p>
                    <p
                        className={cn(
                            "text-lg font-black tabular-nums",
                            customer.delivery_success_rate >= 80 && "text-emerald-600",
                            customer.delivery_success_rate >= 50 && customer.delivery_success_rate < 80 && "text-amber-600",
                            customer.delivery_success_rate < 50 && "text-rose-600",
                        )}
                    >
                        {Math.round(customer.delivery_success_rate)}%
                    </p>
                </div>

                {/* Total Value */}
                <div className={cn(
                    "text-center rounded-2xl p-3",
                    isPlatinum && "bg-[var(--pastel-purple)]/15",
                    (isWarning || isBlocked) && "bg-rose-50",
                    isNew && "bg-[var(--pastel-mint)]/15",
                    !isPlatinum && !isWarning && !isBlocked && !isNew && "bg-[var(--pastel-green)]/25",
                )}>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                        {t("customers.card.totalValue")}
                    </p>
                    <p className={cn(
                        "text-lg font-black tabular-nums",
                        isPlatinum && "text-purple-700",
                        (isWarning || isBlocked) && "text-rose-700",
                        isNew && "text-teal-700",
                        !isPlatinum && !isWarning && !isBlocked && !isNew && "text-emerald-700",
                    )}>
                        {formatCompactValue(customer.total_spent)}
                    </p>
                    <span className="bg-white/60 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block mt-0.5">
                        IQD {formatCompactValue(customer.total_spent)}
                    </span>
                </div>
            </div>

            {/* ── Bottom Row ── */}
            <div className="flex items-center justify-between">
                {/* Left side: last-order indicator or warning/new label */}
                <div className="flex items-center gap-1.5 min-w-0">
                    {warningLabel ? (
                        <>
                            <span className={cn("w-2 h-2 rounded-full shrink-0", tier === "risky" ? "bg-red-700" : "bg-red-500")} />
                            <span className="text-red-600 font-black text-[11px]">
                                {warningLabel}
                            </span>
                        </>
                    ) : isNew && joinText ? (
                        <>
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <span className="text-[11px] text-muted-foreground">
                                {joinText}
                            </span>
                        </>
                    ) : lastOrderDays !== null ? (
                        <>
                            <span
                                className={cn(
                                    "w-2 h-2 rounded-full shrink-0",
                                    lastOrderDays <= 7
                                        ? "bg-green-500"
                                        : lastOrderDays <= 30
                                          ? "bg-amber-500"
                                          : "bg-red-400",
                                )}
                            />
                            <span className="text-[11px] text-muted-foreground truncate">
                                {t("customers.card.lastOrder")} {lastOrderDays === 0
                                    ? t("customers.card.today")
                                    : t("customers.card.daysAgo").replace("{days}", lastOrderDays.toLocaleString("en-US"))}
                            </span>
                            <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                lastOrderDays <= 7 && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                lastOrderDays > 7 && lastOrderDays <= 30 && "bg-amber-50 text-amber-700 border border-amber-200",
                                lastOrderDays > 30 && lastOrderDays <= 60 && "bg-orange-50 text-orange-700 border border-orange-200",
                                lastOrderDays > 60 && "bg-rose-50 text-rose-700 border border-rose-200",
                            )}>
                                {lastOrderDays <= 7 ? "Active" : lastOrderDays <= 30 ? "Cooling" : lastOrderDays <= 60 ? "At Risk" : "Dormant"}
                            </span>
                        </>
                    ) : null}
                </div>

                {/* Right side: action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                    {/* WhatsApp — green for normal/platinum/new; gray for warning; hidden for blocked */}
                    {!isBlocked && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(
                                    `https://wa.me/964${customer.phone}`,
                                    "_blank",
                                );
                            }}
                            className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                                isWarning ? "bg-gray-50 text-gray-600 hover:bg-gray-100" : "bg-green-50 text-green-600 hover:bg-green-100"
                            )}
                        >
                            <MessageCircle className="w-4 h-4" />
                        </button>
                    )}

                    {/* Phone — only for normal/platinum/new tiers */}
                    {!isWarning && !isBlocked && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(`tel:+964${customer.phone}`);
                            }}
                            className="w-8 h-8 rounded-xl bg-gray-50 text-gray-600 flex items-center justify-center hover:bg-gray-100 transition-colors"
                        >
                            <Phone className="w-4 h-4" />
                        </button>
                    )}

                    {/* Block button for blocked tiers */}
                    {isBlocked && (
                        <button
                            onClick={(e) => e.stopPropagation()}
                            className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center hover:bg-red-200 transition-colors"
                        >
                            <Ban className="w-4 h-4" />
                        </button>
                    )}

                    {/* More */}
                    <button
                        onClick={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-xl border border-gray-100 text-gray-400 flex items-center justify-center hover:text-foreground hover:bg-gray-50 transition-colors"
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
