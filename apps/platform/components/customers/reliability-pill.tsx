"use client";

import { ShieldCheck, Clock, AlertTriangle, Sparkles, Ban, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { VALUE_META, RISK_META, type ValueTier, type RiskLevel } from "@/lib/customer-reliability";

const VALUE_ICONS: Record<ValueTier, React.ComponentType<{ className?: string }>> = {
    vip: Crown,
    good: ShieldCheck,
    newcomer: Sparkles,
};

const RISK_ICONS: Record<RiskLevel, React.ComponentType<{ className?: string }>> = {
    clean: ShieldCheck,
    caution: Clock,
    high: AlertTriangle,
    blocked: Ban,
};

/**
 * VALUE axis — the hero pill: how good a customer is, by completed orders
 * (VIP / Good / Newcomer). `hero` = the prominent in-card block; `compact` = a
 * small inline pill for list rows.
 */
export function ValuePill({
    tier,
    variant = "hero",
    className,
}: {
    tier: ValueTier;
    variant?: "hero" | "compact";
    className?: string;
}) {
    const { t } = useLanguage();
    const meta = VALUE_META[tier];
    const Icon = VALUE_ICONS[tier];
    const label = t(`customers.value.${tier}`, meta.label);

    if (variant === "compact") {
        return (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", meta.pillBg, meta.pillText, className)}>
                <Icon className="w-3.5 h-3.5" />
                {label}
            </span>
        );
    }

    return (
        <div className={cn("flex items-center gap-2.5 rounded-2xl px-3.5 py-3", meta.pillBg, meta.pillText, className)}>
            <span className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 leading-none">
                    {t("customers.value.label", "Value")}
                </div>
                <div className="text-base font-extrabold tracking-tight leading-tight truncate">{label}</div>
            </div>
        </div>
    );
}

/**
 * RISK axis — COD trust signal (Clean / Caution / High / Blocked). By default a
 * `clean` customer renders nothing (absence = safe); set `showClean` to force it.
 */
export function RiskChip({
    risk,
    showClean = false,
    className,
}: {
    risk: RiskLevel;
    showClean?: boolean;
    className?: string;
}) {
    const { t } = useLanguage();
    if (risk === "clean" && !showClean) return null;
    const meta = RISK_META[risk];
    const Icon = RISK_ICONS[risk];
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", meta.chipBg, meta.chipText, className)}>
            <Icon className="w-3.5 h-3.5" />
            {t(`customers.risk.${risk}`, meta.label)}
        </span>
    );
}
