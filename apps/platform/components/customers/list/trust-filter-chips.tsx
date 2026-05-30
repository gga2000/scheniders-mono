"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import { TrustTier, TRUST_TIER_CONFIG } from "@/types/customer";
import { AnimatedCounter } from "@/components/ui/animated-counter";

interface TrustFilterChipsProps {
    activeTier: TrustTier | "all" | undefined;
    onTierChange: (tier: TrustTier | "all" | undefined) => void;
    tierCounts?: Record<string, number>;
}

const POSITIVE_TIERS: (TrustTier | "all")[] = ["all", "platinum", "gold", "silver", "bronze", "new"];
const NEGATIVE_TIERS: TrustTier[] = ["watch", "risky", "blocked"];

// Dot color for each tier (visible even when inactive — tier-at-a-glance)
const TIER_DOT_COLORS: Record<string, string> = {
    all: "#6B7280",
    platinum: "#A855F7",
    gold: "#F59E0B",
    silver: "#94A3B8",
    bronze: "#D97706",
    new: "#3B82F6",
    watch: "#EAB308",
    risky: "#EF4444",
    blocked: "#1F2937",
    network: "#8B5CF6",
};

export function TrustFilterChips({ activeTier, onTierChange, tierCounts }: TrustFilterChipsProps) {
    const { t } = useLanguage();
    const current = activeTier || "all";

    function renderChip(tier: TrustTier | "all") {
        const isActive = current === tier;
        const config = tier === "all" ? null : TRUST_TIER_CONFIG[tier];
        const label = tier === "all" ? t("customers.all") : t(config!.labelKey);
        const count = tier === "all" ? undefined : tierCounts?.[tier];
        const dotColor = TIER_DOT_COLORS[tier];

        return (
            <motion.button
                key={tier}
                onClick={() => {
                    // Click-to-deselect: tapping an already-active tier clears the filter
                    if (isActive && tier !== "all") {
                        onTierChange(undefined);
                    } else {
                        onTierChange(tier === "all" ? undefined : tier);
                    }
                }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="relative h-9 px-4 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors"
                style={{ color: isActive ? "var(--background)" : "var(--foreground-muted, #6B7280)" }}
            >
                {/* Sliding active background — shared layoutId glides between pills */}
                {isActive && (
                    <motion.div
                        layoutId="trust-chip-active"
                        className="absolute inset-0 rounded-full bg-foreground shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)]"
                        transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.9 }}
                    />
                )}

                {/* Inactive border */}
                {!isActive && (
                    <span className="absolute inset-0 rounded-full border border-(--card-border) bg-(--card-bg)" />
                )}

                {/* Content sits above the background */}
                <span className="relative flex items-center gap-2">
                    <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                            backgroundColor: dotColor,
                            boxShadow: isActive ? `0 0 6px ${dotColor}` : "none",
                        }}
                    />
                    <span className={isActive ? "text-background" : "text-foreground"}>{label}</span>
                    {count !== undefined && (
                        <span
                            className={`text-[11px] font-semibold tabular-nums ${
                                isActive ? "text-background/70" : "text-muted-foreground"
                            }`}
                        >
                            <AnimatedCounter value={count} />
                        </span>
                    )}
                </span>
            </motion.button>
        );
    }

    return (
        <div className="flex flex-wrap gap-2 items-center">
            {POSITIVE_TIERS.map((tier) => renderChip(tier))}

            {/* Divider between positive and negative tiers */}
            <div className="h-6 w-px bg-(--card-border) mx-1" />

            {NEGATIVE_TIERS.map((tier) => renderChip(tier))}

            {/* Network chip — same visual language */}
            <motion.button
                onClick={() => onTierChange("blocked" as TrustTier)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="relative h-9 px-4 rounded-full text-sm font-semibold flex items-center gap-2"
            >
                <span className="absolute inset-0 rounded-full border border-(--card-border) bg-(--card-bg)" />
                <span className="relative flex items-center gap-2 text-foreground">
                    <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: TIER_DOT_COLORS.network }}
                    />
                    <span>{t("customers.filter.network")}</span>
                    {tierCounts?.blocked !== undefined && (
                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                            <AnimatedCounter value={tierCounts.blocked} />
                        </span>
                    )}
                </span>
            </motion.button>
        </div>
    );
}
