"use client";

import { motion } from "framer-motion";
import { BadgeCheck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface DeliverySuccessCardProps {
    successRate: number;
    /** Recent orders (most recent first) — used to render the bottom outcome pills */
    recentOrders?: Array<{ id: string | number; status: string }>;
    /**
     * Total completed orders as reported by the authoritative trust engine. Used
     * as a fallback when `recentOrders` is empty (e.g. RLS has scoped orders to
     * the current tenant but the trust row is global).
     */
    totalCompletedFromTrust?: number;
}

type Tone = "neutral" | "mint" | "yellow" | "orange" | "rose";

interface ToneStyle {
    bg: string;
    text: string;
    sub: string;
    icon: string;
    pill: string;
}

const TONE_STYLES: Record<Tone, ToneStyle> = {
    neutral: {
        bg: "bg-muted/30",
        text: "text-muted-foreground",
        sub: "text-muted-foreground/70",
        icon: "text-muted-foreground",
        pill: "bg-muted/50",
    },
    mint: {
        bg: "bg-[#c7f8ef] dark:bg-emerald-500/15",
        text: "text-[#33605a] dark:text-emerald-200",
        sub: "text-[#33605a]/60 dark:text-emerald-200/60",
        icon: "text-[#33605a] dark:text-emerald-300",
        pill: "bg-[#33605a] dark:bg-emerald-400",
    },
    yellow: {
        bg: "bg-[var(--pastel-yellow)] dark:bg-amber-500/15",
        text: "text-amber-800 dark:text-amber-200",
        sub: "text-amber-700/70 dark:text-amber-200/60",
        icon: "text-amber-700 dark:text-amber-300",
        pill: "bg-amber-700",
    },
    orange: {
        bg: "bg-orange-100 dark:bg-orange-500/15",
        text: "text-orange-800 dark:text-orange-200",
        sub: "text-orange-700/70 dark:text-orange-200/60",
        icon: "text-orange-700 dark:text-orange-300",
        pill: "bg-orange-700",
    },
    rose: {
        bg: "bg-rose-100 dark:bg-rose-500/15",
        text: "text-rose-800 dark:text-rose-200",
        sub: "text-rose-700/70 dark:text-rose-200/60",
        icon: "text-rose-700 dark:text-rose-300",
        pill: "bg-rose-700",
    },
};

function pickTone(rate: number, hasOrders: boolean): Tone {
    if (!hasOrders) return "neutral";
    if (rate >= 85) return "mint";
    if (rate >= 60) return "yellow";
    if (rate >= 30) return "orange";
    return "rose";
}

type OutcomeColor = "emerald" | "rose" | "amber" | "blue" | "muted";

const OUTCOME_PILL_BG: Record<OutcomeColor, string> = {
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    muted: "bg-muted/40",
};

function statusToOutcome(status: string): OutcomeColor {
    const s = status?.toLowerCase();
    if (s === "delivered" || s === "completed") return "emerald";
    if (s === "rejected" || s === "returned" || s === "refunded") return "rose";
    if (s === "cancelled" || s === "canceled") return "amber";
    if (s === "in_transit" || s === "shipping" || s === "confirmed" || s === "pending") return "blue";
    return "muted";
}

function isCompleted(status: string): boolean {
    const s = status?.toLowerCase();
    return (
        s === "delivered" ||
        s === "completed" ||
        s === "rejected" ||
        s === "returned" ||
        s === "cancelled" ||
        s === "canceled" ||
        s === "refunded"
    );
}

export function DeliverySuccessCard({
    successRate,
    recentOrders = [],
    totalCompletedFromTrust = 0,
}: DeliverySuccessCardProps) {
    const { t } = useLanguage();

    const completedOrders = recentOrders.filter((o) => isCompleted(o.status));
    // Treat the rate as meaningful if either the live orders list has completed
    // rows OR the authoritative trust row reports prior completions.
    const totalCompleted = Math.max(completedOrders.length, totalCompletedFromTrust);
    const hasOrders = totalCompleted > 0;

    const tone = pickTone(successRate, hasOrders);
    const styles = TONE_STYLES[tone];

    // Last 6 outcomes (most recent first → reverse to read left → right oldest → newest)
    const last6 = [...recentOrders].slice(0, 6).reverse();

    const subtitle = !hasOrders
        ? t("customers.trust.noCompletedYet")
        : totalCompleted === 1
        ? t("customers.trust.basedOnOne")
        : t("customers.trust.basedOnMany", { orders: totalCompleted.toLocaleString("en-US") });

    return (
        <div
            className={cn(
                "group rounded-[3rem] p-8 aspect-square flex flex-col justify-between transition-all duration-300 hover:translate-y-[-4px]",
                styles.bg
            )}
        >
            {/* Top row */}
            <div className="flex items-start justify-between">
                <div>
                    <p className={cn("font-headline font-bold text-lg mb-1", styles.text)}>
                        {t("customers.trust.successRate")}
                    </p>
                    <p className={cn("text-xs", styles.sub)}>{subtitle}</p>
                </div>
                <BadgeCheck className={cn("w-8 h-8 opacity-30 shrink-0", styles.icon)} />
            </div>

            {/* Giant percentage (or empty state copy) */}
            {hasOrders ? (
                <motion.p
                    className={cn(
                        "text-7xl font-black font-headline tabular-nums leading-none",
                        styles.text
                    )}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                >
                    {Math.round(successRate)}%
                </motion.p>
            ) : (
                <motion.p
                    className={cn("text-2xl font-headline font-bold leading-snug", styles.text)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                >
                    {t("customers.trust.awaitingOrders")}
                </motion.p>
            )}

            {/* Real outcome pills — last 6 orders, oldest → newest */}
            <div>
                <div className="flex items-end gap-2">
                    {last6.length > 0 ? (
                        last6.map((order, i) => {
                            const color = statusToOutcome(order.status);
                            return (
                                <motion.div
                                    key={`${order.id}-${i}`}
                                    className={cn(
                                        "flex-1 rounded-full",
                                        OUTCOME_PILL_BG[color],
                                        "h-8"
                                    )}
                                    initial={{ scaleY: 0, originY: 1 }}
                                    animate={{ scaleY: 1 }}
                                    transition={{ delay: i * 0.07, duration: 0.45, ease: "easeOut" }}
                                    title={order.status}
                                />
                            );
                        })
                    ) : (
                        // Empty placeholder dashes
                        Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex-1 rounded-full h-2 opacity-40",
                                    styles.pill
                                )}
                            />
                        ))
                    )}
                </div>
                {last6.length > 0 && (
                    <p className={cn("text-[10px] mt-2", styles.sub)}>
                        {t("customers.trust.last6Outcomes")}
                    </p>
                )}
            </div>
        </div>
    );
}
