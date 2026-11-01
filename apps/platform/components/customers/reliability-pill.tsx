"use client";

import { ShieldCheck, Clock, AlertTriangle, Sparkles, Ban, Crown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { VALUE_META, RISK_META, customerAccent, type ValueTier, type RiskLevel } from "@/lib/customer-reliability";

/** Value tiers are about spend, so they use value metaphors; the shield belongs to COD risk alone. */
const VALUE_ICONS: Record<ValueTier, React.ComponentType<{ className?: string }>> = {
    vip: Crown,
    good: TrendingUp,
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
            // The label truncates only where a caller lets the pill shrink (min-w-0, the grid card).
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", meta.pillBg, meta.pillText, className)}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{label}</span>
            </span>
        );
    }

    return (
        <div className={cn("flex items-center gap-2.5 rounded-2xl px-3.5 py-3", meta.pillBg, meta.pillText, className)}>
            <span className="w-7 h-7 rounded-lg bg-white/60 dark:bg-white/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
                <div className="text-xs font-medium opacity-75 leading-none">
                    {t("customers.value.label", "Value")}
                </div>
                <div className="text-base font-extrabold tracking-tight leading-tight truncate">{label}</div>
            </div>
        </div>
    );
}

/**
 * The one WhatsApp button colour on every customer surface (card, table,
 * drawer, profile): a soft lime that reads as "WhatsApp" without shouting
 * louder than a do-not-ship warning next to it.
 */
export const WHATSAPP_TONE = "bg-lime-50 text-lime-800 hover:bg-lime-100 dark:bg-lime-400/15 dark:text-lime-200 dark:hover:bg-lime-400/25";

/** The value icon, so every surface (pill, drawer band, profile) shows the same one. */
export function ValueIcon({ tier, className }: { tier: ValueTier; className?: string }) {
    const Icon = VALUE_ICONS[tier];
    return <Icon className={className} />;
}

/** The risk icon, for surfaces drawn in the risk colour. */
export function RiskIcon({ risk, className }: { risk: RiskLevel; className?: string }) {
    const Icon = RISK_ICONS[risk];
    return <Icon className={className} />;
}

/**
 * The card's hero block: the value tier, or — for a blocked or high-risk
 * customer — the COD risk, so an unsafe customer never leads with "Good".
 */
export function CustomerHeroBand({ tier, risk, className }: { tier: ValueTier; risk: RiskLevel; className?: string }) {
    const { t } = useLanguage();
    if (risk !== "blocked" && risk !== "high") return <ValuePill tier={tier} variant="hero" className={className} />;
    const accent = customerAccent(tier, risk);
    const Icon = RISK_ICONS[risk];
    return (
        <div className={cn("flex items-center gap-2.5 rounded-2xl px-3.5 py-3", accent.surfaceBg, accent.surfaceText, className)}>
            <span className="w-7 h-7 rounded-lg bg-white/60 dark:bg-white/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
                <div className="text-xs font-medium opacity-75 leading-none">
                    {t("customers.risk.label", "COD risk")}
                </div>
                <div className="text-base font-extrabold tracking-tight leading-tight truncate">{t(`customers.risk.${risk}`, RISK_META[risk].label)}</div>
            </div>
        </div>
    );
}

/** A shorter word for the narrow grid card, where the full one would push the "+N" off the row. */
const SHORT_RISK_KEY: Partial<Record<RiskLevel, string>> = {
    caution: "customers.risk.cautionShort",
};

/**
 * RISK axis — COD trust signal (Clean / Caution / High / Blocked). By default a
 * `clean` customer renders nothing (absence = safe); set `showClean` to force it.
 * `short` prints the card's shorter word, with the full one on hover.
 */
export function RiskChip({
    risk,
    showClean = false,
    short = false,
    className,
}: {
    risk: RiskLevel;
    showClean?: boolean;
    short?: boolean;
    className?: string;
}) {
    const { t } = useLanguage();
    if (risk === "clean" && !showClean) return null;
    const meta = RISK_META[risk];
    const Icon = RISK_ICONS[risk];
    const full = t(`customers.risk.${risk}`, meta.label);
    const shortKey = short ? SHORT_RISK_KEY[risk] : undefined;
    return (
        // The label truncates only where a caller lets the chip shrink (min-w-0, the grid card).
        <span
            title={shortKey ? full : undefined}
            className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", meta.chipBg, meta.chipText, className)}
        >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{shortKey ? t(shortKey) : full}</span>
            {shortKey && <span className="sr-only"> ({full})</span>}
        </span>
    );
}
